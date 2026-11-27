/**
 * Headless batch runner for seeded AI-against-AI battles (the simulation
 * tier: never part of `npx vitest run`). Used to compare battle AIs (bead
 * bzc.20) and to measure faction balance (bead bzc.24).
 *
 *   npm run sim:battles -- [options]
 *
 *   --mode ai|balance   ai (default): policy A against policy B, each game
 *                       played twice with the policies' sides swapped.
 *                       balance: policy A on both sides; win rates per
 *                       faction pairing (both sides of every pairing).
 *   --a v2 --b v1       policies: v1 (the frozen baseline), v2, v2-fast
 *                       (the fast mode of bead bzc.37), v2-nohero (no
 *                       hero acts), or v2:<weight>=<n>,... overrides.
 *   --seeds 20          seeds per matchup
 *   --budget 12000      army budget in gold equivalents (tests/sim/armies.ts)
 *   --level 6           hero level
 *   --only faction|neutral   restrict the matchups
 *   --guard 0.8         neutral guard fight value / army fight value
 *   --limit 30          round limit of every battle (default the engine's)
 *   --hero full|nobook|none   heroes in faction battles (default full)
 *   --stage early|mid|late    budget and hero level of a game stage
 *                       (tests/sim/armies.ts STAGES; overrides --budget
 *                       and --level)
 *   --json <file>       also write the raw results as JSON
 *
 * Balance report modes (docs/design/BALANCE.md; policy A on both sides):
 *
 *   --mode report       every stage x hero mode: each faction's win rate
 *                       over cross-faction battles (both sides), the
 *                       attacker's win rate, rounds and round-limit share;
 *                       --matrix also prints every pairing; --acts the
 *                       hero acts per battle of each faction.
 *   --mode guards       a hero against map guards (the generator's stray
 *                       roster and deployment) at --ratios 0.4,0.6,...
 *                       (guard FV / army FV) per stage: win rate, rounds
 *                       and the hero's fight value lost.
 *   --mode tiers        fight value per 1000 gold by tier and faction.
 *   --mode timing       resolve time of small, medium and large battles
 *                       (3, 5 and 7 stacks a side, early, mid and late
 *                       heroes) for policy A and B (default v2 and
 *                       v2-fast), --seeds battles per size.
 *   --mode duels        one tier against the same tier of each other
 *                       faction, equal gold (--budget), no heroes.
 *   --pf <faction>=<policy>   that faction plays this policy in the report
 *                       (for example humans=v2:castFraction=99: no casts).
 *   --gear stage|bare   heroes with their stage's level-ups (the adventure
 *                       AI's skill and feat picks), guild and shrine
 *                       pages, scrolls and artifacts (stage, default), or
 *                       round 1's pattern stats and seeded book (bare).
 *   --lean might|magic  every hero of the run leans this way (default:
 *                       might and magic alternate by seed).
 *   --pairs "undead v goblins,goblins v humans"   play only these faction
 *                       pairings (attacker v defender), to rerun outlier
 *                       cells with more seeds.
 *   --tweak id.field=n,...   override creature numbers (or
 *                       class:<id>.<stat>) for this run only.
 *
 * Every battle runs from a seeded setup through the real engine; every
 * chosen action is checked with actionError first (an illegal one is
 * counted and the battle is abandoned). Exit code 1 if any action was
 * illegal.
 */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  actionError,
  activeStack,
  applyAction,
  chooseAiAction,
  createAiMemo,
  createBattle,
  creatureFightValue,
  engineSetupFromGame,
} from "../../src/core/battle/index.ts";
import type {
  AiWeights,
  BattleAction,
  BattleSide,
  BattleState,
} from "../../src/core/battle/index.ts";
import { registerSpells } from "../../src/core/magic/index.ts";
import { FACTION_SCHOOL_WEIGHTS } from "../../src/core/magic/guild.ts";
import type {
  BattleSetup as GameBattleSetup,
  BattleSide as GameBattleSide,
} from "../../src/core/game/battle.ts";
import { chooseAiAction as chooseV1 } from "./ai-v1.ts";
import {
  FACTIONS,
  HERO_MODES,
  STAGES,
  STAGE_IDS,
  STAGE_KITS,
  armyFightValue,
  buildArmy,
  buildGuard,
  buildHero,
  buildMapGuard,
  creatureCost,
  gameSetup,
  guardSide,
  heroLessSide,
  heroSide,
  withoutBook,
} from "./armies.ts";
import type { Faction, HeroGear, HeroKit, HeroMode, Stage } from "./armies.ts";
import { rosterOf } from "../../src/data/factionCreatures.ts";
import { CREATURES } from "../../src/data/creatures.ts";
import { getHeroClass } from "../../src/data/classes.ts";

registerSpells();

export type Policy = (state: BattleState) => BattleAction;

/** Policy crashes (exceptions), by policy spec. */
export const crashes = new Map<string, number>();

/**
 * A policy that throws is counted and the stack Defends instead (a guard:
 * previewAttack no longer throws on an attack whose strike never lands).
 */
function guarded(spec: string, p: Policy): Policy {
  return (s) => {
    try {
      return p(s);
    } catch (e) {
      crashes.set(spec, (crashes.get(spec) ?? 0) + 1);
      if (crashes.get(spec) === 1) console.error(`${spec} threw: ${String(e)}`);
      return { type: "defend", stackId: s.activeStackId as string };
    }
  };
}

export function parsePolicy(spec: string): Policy {
  return guarded(spec, policyOf(spec));
}

function policyOf(spec: string): Policy {
  if (spec === "v1") return chooseV1;
  if (spec === "v2") return (s) => chooseAiAction(s);
  if (spec === "v2-fast") {
    // As auto-play runs it: one memo, started afresh by each new battle
    // (another seed) or round.
    const memo = createAiMemo();
    return (s) => chooseAiAction(s, { mode: "fast", memo });
  }
  if (spec === "v2-nohero")
    return (s) => chooseAiAction(s, { heroActs: false });
  if (spec.startsWith("v2:")) {
    const weights: Record<string, number> = {};
    for (const kv of spec.slice(3).split(",")) {
      const [k, v] = kv.split("=");
      if (k === undefined || v === undefined || Number.isNaN(Number(v)))
        throw new Error(`bad weight ${kv}`);
      weights[k] = Number(v);
    }
    return (s) => chooseAiAction(s, { weights: weights as Partial<AiWeights> });
  }
  throw new Error(`unknown policy ${spec}`);
}

export interface Played {
  readonly winner: BattleSide | null;
  readonly reason: string;
  readonly rounds: number;
  readonly illegal: number;
  /** Per side: decisions and milliseconds spent deciding. */
  readonly decisions: Record<BattleSide, number>;
  readonly ms: Record<BattleSide, number>;
  /** Hero acts per side by act kind (cast, command, item). */
  readonly heroActs: Record<BattleSide, number>;
  /** The hero acts' ids per side, in order (the --acts tally). */
  readonly acts: Record<BattleSide, string[]>;
  /** Fight value left at the end (survivors), per side. */
  readonly left: Record<BattleSide, number>;
  /** Fight value at the start, per side. */
  readonly start: Record<BattleSide, number>;
}

/** Plays one battle with a policy per side. */
/** One line per action (the --trace option). */
function describe(state: BattleState, action: BattleAction): string {
  const s = activeStack(state);
  const who = s ? `${s.id} ${s.count} ${s.creature.id}` : "?";
  const at = (h: { col: number; row: number }) => `(${h.col},${h.row})`;
  const name = (id: string) => {
    const t = state.stacks.find((x) => x.id === id);
    return t ? `${t.id} ${t.count} ${t.creature.id}` : id;
  };
  const tgt = (ts: readonly unknown[]) => JSON.stringify(ts);
  switch (action.type) {
    case "move":
      return `${who} move ${at(action.to)}${action.swapWith ? ` swap ${action.swapWith}` : ""}`;
    case "attack":
      return `${who} attack ${name(action.targetId)} from ${at(action.from)}${action.after ? ` then ${at(action.after)}` : ""}`;
    case "shoot":
      return `${who} shoot ${name(action.targetId)}`;
    case "shootHex":
      return `${who} shoot hex ${at(action.at)}`;
    case "ability":
      return `${who} ability ${action.ability} ${tgt(action.targets)}${action.from ? ` from ${at(action.from)}` : ""}`;
    case "creatureCast":
      return `${who} casts ${action.spell} ${tgt(action.targets)}`;
    case "heroAct":
      return `${who} HERO ${action.act} ${tgt(action.targets)}${action.scroll ? " scroll" : ""}${action.echo ? " echo" : ""}${action.fuel ? " fuel" : ""}`;
    default:
      return `${who} ${action.type}`;
  }
}

/** Round limit override for every battle of the run (--limit). */
let limitOverride: number | undefined;

/** One faction's own policy in the report (--pf <faction>=<spec>). */
const factionPolicy: Partial<Record<Faction, Policy>> = {};

/** Hero gear of the run (--gear stage|bare; default stage). */
let gear: HeroGear = "stage";

/** Only these pairings ("undead v goblins", ...) when set (--pairs). */
let pairFilter: ReadonlySet<string> | undefined;

/** Every hero's leaning (--lean); undefined alternates by seed. */
let leanOverride: "might" | "magic" | undefined;

/** The stage kit for a hero level (bare gear: none, round 1's heroes). */
function kitFor(level: number): HeroKit | null {
  if (gear === "bare") return null;
  return STAGE_KITS[level <= 7 ? "early" : level <= 14 ? "mid" : "late"];
}

export function play(
  setup: GameBattleSetup,
  policies: Record<BattleSide, Policy>,
  trace = false,
): Played {
  let state = createBattle({
    ...engineSetupFromGame(setup),
    ...(limitOverride !== undefined ? { roundLimit: limitOverride } : {}),
  }).state;
  const start = { attacker: 0, defender: 0 };
  for (const s of state.stacks)
    if (!s.summoned) start[s.owner] += s.count * creatureFightValue(s.creature);
  const decisions = { attacker: 0, defender: 0 };
  const ms = { attacker: 0, defender: 0 };
  const heroActs = { attacker: 0, defender: 0 };
  const acts: Record<BattleSide, string[]> = { attacker: [], defender: [] };
  let illegal = 0;
  let guard = 0;
  let lastRound = 0;
  while (state.winner === null && guard++ < 5000) {
    const self = activeStack(state);
    if (!self) break;
    const side = self.side;
    const t = performance.now();
    const action = policies[side](state);
    ms[side] += performance.now() - t;
    decisions[side]++;
    const err = actionError(state, action);
    if (err !== null) {
      illegal++;
      console.error(`illegal ${JSON.stringify(action)}: ${err}`);
      break;
    }
    if (action.type === "heroAct") {
      heroActs[side]++;
      acts[side].push(action.act + (action.scroll === true ? "*" : ""));
    }
    if (trace && state.round !== lastRound) {
      lastRound = state.round;
      console.log(
        `-- round ${state.round}: ${state.stacks
          .filter((s) => s.count > 0)
          .map(
            (s) =>
              `${s.id}:${s.count} ${s.creature.id}@${s.hex.col},${s.hex.row}${s.conditions.length > 0 ? `[${s.conditions.map((c) => c.kind).join(",")}]` : ""}`,
          )
          .join(" ")}`,
      );
    }
    if (trace)
      console.log(
        `r${state.round} ${side.padEnd(8)} ${describe(state, action)}`,
      );
    state = applyAction(state, action).state;
  }
  const left = { attacker: 0, defender: 0 };
  for (const s of state.stacks) {
    if (s.count <= 0 || s.summoned) continue;
    left[s.owner] += s.count * creatureFightValue(s.creature);
  }
  return {
    winner: state.winner,
    reason: state.endReason ?? "unfinished",
    rounds: state.round,
    illegal,
    decisions,
    ms,
    heroActs,
    acts,
    left,
    start,
  };
}

interface Matchup {
  readonly name: string;
  /** The setup of seed i. */
  readonly setup: (seed: number) => GameBattleSetup;
}

/** One side of a faction battle (hero per `mode`), seeded. */
function factionSide(
  f: Faction,
  budget: number,
  level: number,
  seed: number,
  lean: "might" | "magic",
  mode: HeroMode,
  owner: number,
): GameBattleSide {
  const army = buildArmy(f, budget, seed);
  if (mode === "none") return heroLessSide(f, army, owner);
  const hero = buildHero(f, level, seed, lean, kitFor(level));
  return heroSide(f, mode === "nobook" ? withoutBook(hero) : hero, army, owner);
}

function factionMatchups(
  budget: number,
  level: number,
  mode: HeroMode = "full",
): Matchup[] {
  const out: Matchup[] = [];
  for (const a of FACTIONS)
    for (const d of FACTIONS) {
      if (pairFilter !== undefined && !pairFilter.has(`${a} v ${d}`)) continue;
      out.push({
        name: `${a} v ${d}`,
        setup: (seed) => {
          const la = leanOverride ?? (seed % 2 === 0 ? "might" : "magic");
          const ld =
            leanOverride ?? ((seed >> 1) % 2 === 0 ? "might" : "magic");
          return gameSetup(
            seed,
            factionSide(a, budget, level, seed, la, mode, 1),
            factionSide(d, budget, level, seed + 7777, ld, mode, 2),
          );
        },
      });
    }
  return out;
}

function neutralMatchups(
  budget: number,
  level: number,
  ratio: number,
  ring: number | null = null,
): Matchup[] {
  return FACTIONS.map((f: Faction) => ({
    name: `${f} v guard`,
    setup: (seed: number) => {
      const army = buildArmy(f, budget, seed);
      const fv = armyFightValue(army) * ratio;
      const lean = leanOverride ?? (seed % 2 === 0 ? "might" : "magic");
      return gameSetup(
        seed,
        heroSide(f, buildHero(f, level, seed, lean, kitFor(level)), army, 1),
        guardSide(
          ring === null ? buildGuard(fv, seed) : buildMapGuard(fv, seed, ring),
        ),
      );
    },
  }));
}

interface Row {
  name: string;
  games: number;
  aWins: number;
  /** A's wins when it played the attacker (half the games in ai mode). */
  aAttWins: number;
  bWins: number;
  draws: number;
  attackerWins: number;
  rounds: number;
  roundLimit: number;
}

function parseArgs(args: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const k = args[i] as string;
    if (!k.startsWith("--")) continue;
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) m.set(k.slice(2), "true");
    else {
      m.set(k.slice(2), v);
      i++;
    }
  }
  return m;
}

const pct = (n: number, d: number): string =>
  d === 0 ? "   -" : `${((100 * n) / d).toFixed(0).padStart(3)}%`;

interface Tally {
  games: number;
  attackerWins: number;
  rounds: number;
  roundLimit: number;
  /** Attacker wins among the battles decided at the round limit. */
  limitAttackerWins: number;
  /** Wins per faction over cross-faction battles, and their games. */
  wins: Record<Faction, number>;
  played: Record<Faction, number>;
  /** Attacker wins in each pairing (the matrix). */
  pairs: Map<string, { games: number; att: number }>;
  /** Hero acts per faction (act id, "*" for a scroll) and its sides. */
  acts: Record<Faction, Map<string, number>>;
  sides: Record<Faction, number>;
}

/** Plays every faction pairing with `policy` on both sides. */
function tallyFactions(
  policy: Policy,
  budget: number,
  level: number,
  mode: HeroMode,
  seeds: number,
): Tally {
  const t: Tally = {
    games: 0,
    attackerWins: 0,
    rounds: 0,
    roundLimit: 0,
    limitAttackerWins: 0,
    wins: { humans: 0, undead: 0, goblins: 0, candy: 0, dwarves: 0 },
    played: { humans: 0, undead: 0, goblins: 0, candy: 0, dwarves: 0 },
    pairs: new Map(),
    acts: {
      humans: new Map(),
      undead: new Map(),
      goblins: new Map(),
      candy: new Map(),
      dwarves: new Map(),
    },
    sides: { humans: 0, undead: 0, goblins: 0, candy: 0, dwarves: 0 },
  };
  for (const m of factionMatchups(budget, level, mode)) {
    const [att, , def] = m.name.split(" ") as [Faction, string, Faction];
    const pair = { games: 0, att: 0 };
    for (let i = 0; i < seeds; i++) {
      const r = play(m.setup(1000 + i), {
        attacker: factionPolicy[att] ?? policy,
        defender: factionPolicy[def] ?? policy,
      });
      t.games++;
      pair.games++;
      for (const [side, f] of [
        ["attacker", att],
        ["defender", def],
      ] as const) {
        t.sides[f]++;
        for (const a of r.acts[side])
          t.acts[f].set(a, (t.acts[f].get(a) ?? 0) + 1);
      }
      t.rounds += r.rounds;
      if (r.reason === "roundLimit") {
        t.roundLimit++;
        if (r.winner === "attacker") t.limitAttackerWins++;
      }
      if (r.winner === "attacker") {
        t.attackerWins++;
        pair.att++;
      }
      if (att !== def) {
        t.played[att]++;
        t.played[def]++;
        if (r.winner === "attacker") t.wins[att]++;
        else if (r.winner === "defender") t.wins[def]++;
      }
    }
    t.pairs.set(m.name, pair);
  }
  return t;
}

function reportMode(
  policy: Policy,
  seeds: number,
  stages: readonly Stage[],
  modes: readonly HeroMode[],
  matrix: boolean,
  acts = false,
): void {
  console.log(
    "stage     heroes   humans  undead  goblins   candy   dwarves   att win  mirror att  rounds  at limit  att at limit",
  );
  for (const stage of stages) {
    const { budget, level } = STAGES[stage];
    for (const mode of modes) {
      const t = tallyFactions(policy, budget, level, mode, seeds);
      let mirror = 0;
      let mirrorN = 0;
      for (const f of FACTIONS) {
        const p = t.pairs.get(`${f} v ${f}`);
        if (p) {
          mirror += p.att;
          mirrorN += p.games;
        }
      }
      const f = (x: Faction) => pct(t.wins[x], t.played[x]).padStart(6);
      console.log(
        `${stage.padEnd(9)} ${mode.padEnd(7)} ${f("humans")}  ${f("undead")}   ${f("goblins")}  ${f("candy")}  ${f("dwarves")}     ${pct(t.attackerWins, t.games)}        ${pct(mirror, mirrorN)}  ${(t.rounds / t.games).toFixed(1).padStart(6)}      ${pct(t.roundLimit, t.games)}          ${pct(t.limitAttackerWins, t.roundLimit)}`,
      );
      if (matrix)
        for (const [name, p] of t.pairs)
          console.log(`    ${name.padEnd(22)} attacker ${pct(p.att, p.games)}`);
      if (acts)
        for (const f of FACTIONS) {
          const list = [...t.acts[f]]
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => `${id} ${(n / t.sides[f]).toFixed(2)}`);
          console.log(`    acts per battle, ${f}: ${list.join(", ")}`);
        }
    }
  }
}

function guardsMode(
  policy: Policy,
  seeds: number,
  stages: readonly Stage[],
  ratios: readonly number[],
): void {
  console.log(
    "stage     ratio  faction   win   rounds  at limit  hero FV lost (wins)",
  );
  for (const stage of stages) {
    const { budget, level, ring } = STAGES[stage];
    for (const ratio of ratios) {
      const all = { games: 0, wins: 0, rounds: 0, limit: 0, lost: 0 };
      for (const m of neutralMatchups(budget, level, ratio, ring)) {
        const row = { games: 0, wins: 0, rounds: 0, limit: 0, lost: 0 };
        for (let i = 0; i < seeds; i++) {
          const r = play(m.setup(1000 + i), {
            attacker: policy,
            defender: policy,
          });
          row.games++;
          row.rounds += r.rounds;
          if (r.reason === "roundLimit") row.limit++;
          if (r.winner === "attacker") {
            row.wins++;
            row.lost += 1 - r.left.attacker / Math.max(1, r.start.attacker);
          }
        }
        for (const k of ["games", "wins", "rounds", "limit", "lost"] as const)
          all[k] += row[k];
        console.log(
          `${stage.padEnd(9)} ${ratio.toFixed(2)}   ${m.name.split(" ")[0]?.padEnd(8)} ${pct(row.wins, row.games)}  ${(row.rounds / row.games).toFixed(1).padStart(6)}     ${pct(row.limit, row.games)}         ${pct(row.lost, row.wins)}`,
        );
      }
      console.log(
        `${stage.padEnd(9)} ${ratio.toFixed(2)}   all      ${pct(all.wins, all.games)}  ${(all.rounds / all.games).toFixed(1).padStart(6)}     ${pct(all.limit, all.games)}         ${pct(all.lost, all.wins)}`,
      );
    }
  }
}

/**
 * --tweak squire.hp=11,goblin.cost.gold=40,knight.growth=3: overrides
 * creature numbers for this run only (trying a change before writing it
 * into src/data). Fields: hp, attack, defense, damage, speed, shots,
 * growth, cost.gold, cost.wood, cost.ore, cost.essence.
 */
function applyTweaks(spec: string): void {
  for (const kv of spec.split(",")) {
    const [path, v] = kv.split("=");
    const [id, ...field] = (path ?? "").split(".");
    if (id?.startsWith("school:")) {
      // school:goblins.storm=3: a faction's guild school weight.
      const w = FACTION_SCHOOL_WEIGHTS[id.slice(7)]?.weights as unknown as
        Record<string, number> | undefined;
      const key = field[0] as string;
      if (
        w === undefined ||
        typeof w[key] !== "number" ||
        Number.isNaN(Number(v))
      )
        throw new Error(`bad tweak ${kv}`);
      w[key] = Number(v);
      continue;
    }
    if (id?.startsWith("class:")) {
      // class:knight-errant.attack=3: a hero class's starting stats.
      const stats = getHeroClass(id.slice(6)).stats as unknown as Record<
        string,
        number
      >;
      const key = field[0] as string;
      if (typeof stats[key] !== "number" || Number.isNaN(Number(v)))
        throw new Error(`bad tweak ${kv}`);
      stats[key] = Number(v);
      continue;
    }
    const def = CREATURES[id as keyof typeof CREATURES] as unknown as
      Record<string, unknown> | undefined;
    const n = Number(v);
    if (def === undefined || field.length === 0 || Number.isNaN(n))
      throw new Error(`bad tweak ${kv}`);
    if (field[0] === "cost" && field[1] !== undefined) {
      def.cost = { ...(def.cost as object), [field[1]]: n };
    } else if (typeof def[field[0] as string] === "number") {
      def[field[0] as string] = n;
    } else throw new Error(`bad tweak field ${kv}`);
  }
  console.log(`tweaks: ${spec}`);
}

/**
 * Battle sizes for --mode timing (bead bzc.37): stacks per side and the
 * game stage of the armies and heroes (the side keeps its highest tiers).
 */
const TIMING_SIZES = [
  { name: "small", stacks: 3, stage: "early" },
  { name: "medium", stacks: 5, stage: "mid" },
  { name: "large", stacks: 7, stage: "late" },
] as const;

/**
 * Resolve time of whole battles (decisions and engine) by size, each
 * policy on both sides of the same seeded faction battles with full
 * heroes: mean, median and slowest milliseconds per battle.
 */
function timingMode(specs: readonly string[], seeds: number): void {
  console.log(
    "size    stacks  policy      battles  decisions  mean ms  median ms  max ms",
  );
  const means = new Map<string, number>();
  for (const size of TIMING_SIZES) {
    const { budget, level } = STAGES[size.stage];
    const setups: GameBattleSetup[] = [];
    for (let i = 0; i < seeds; i++) {
      const a = FACTIONS[i % 3] as Faction;
      const d = FACTIONS[(i + 1 + Math.floor(i / 3)) % 3] as Faction;
      const seed = 2000 + i;
      const side = (f: Faction, s: number, owner: number): GameBattleSide => {
        const army = buildArmy(f, budget, s).slice(-size.stacks);
        const hero = buildHero(
          f,
          level,
          s,
          s % 2 === 0 ? "might" : "magic",
          kitFor(level),
        );
        return heroSide(f, hero, army, owner);
      };
      setups.push(gameSetup(seed, side(a, seed, 1), side(d, seed + 7777, 2)));
    }
    // The policies take turns battle by battle, so a change in the
    // machine's load falls on both alike.
    const runs = specs.map((spec) => ({
      spec,
      policy: parsePolicy(spec),
      times: [] as number[],
      decisions: 0,
    }));
    let stacks = 0;
    for (const setup of setups) {
      stacks += setup.attacker.stacks.length + setup.defender.stacks.length;
      for (const run of runs) {
        const t = performance.now();
        const r = play(setup, { attacker: run.policy, defender: run.policy });
        run.times.push(performance.now() - t);
        run.decisions += r.decisions.attacker + r.decisions.defender;
        if (r.illegal > 0) console.log(`  ${run.spec}: illegal action`);
      }
    }
    for (const { spec, times, decisions } of runs) {
      const sorted = [...times].sort((x, y) => x - y);
      const mean = times.reduce((x, y) => x + y, 0) / times.length;
      means.set(`${size.name}:${spec}`, mean);
      console.log(
        `${size.name.padEnd(7)} ${(stacks / setups.length).toFixed(1).padStart(6)}  ${spec.padEnd(10)} ${String(setups.length).padStart(8)}  ${String(decisions).padStart(9)}  ${mean.toFixed(0).padStart(7)}  ${(sorted[sorted.length >> 1] ?? 0).toFixed(0).padStart(9)}  ${(sorted[sorted.length - 1] ?? 0).toFixed(0).padStart(6)}`,
      );
    }
    const [first, second] = specs;
    if (first !== undefined && second !== undefined) {
      const x = means.get(`${size.name}:${first}`) ?? 0;
      const y = means.get(`${size.name}:${second}`) ?? 1;
      console.log(`        ${first} / ${second}: ${(x / y).toFixed(1)}x`);
    }
  }
}

/**
 * Tier duels: one tier of a faction against the same tier of another,
 * equal gold (at least `budget`, at least 3 of the dearer creature), no
 * heroes, both sides of every pairing. A tier's win rate over the two
 * other factions shows which tier is off.
 */
function duelsMode(policy: Policy, seeds: number, budget: number): void {
  console.log("tier  " + FACTIONS.map((f) => f.padEnd(10)).join(""));
  for (let tier = 0; tier < 6; tier++) {
    const wins: Record<Faction, number> = {
      humans: 0,
      undead: 0,
      goblins: 0,
      candy: 0,
      dwarves: 0,
    };
    const games: Record<Faction, number> = {
      humans: 0,
      undead: 0,
      goblins: 0,
      candy: 0,
      dwarves: 0,
    };
    for (const a of FACTIONS)
      for (const d of FACTIONS) {
        if (a === d) continue;
        const ca = rosterOf(a)[tier];
        const cd = rosterOf(d)[tier];
        if (!ca || !cd) continue;
        const gold = Math.max(
          budget,
          3 * Math.max(creatureCost(ca), creatureCost(cd)),
        );
        for (let i = 0; i < seeds; i++) {
          const seed = 2000 + i;
          // Split a tier into two stacks so area and adjacency rules apply.
          const split = (c: typeof ca) => {
            const n = Math.max(1, Math.floor(gold / creatureCost(c)));
            return n >= 2
              ? [
                  { creature: c.id, count: Math.ceil(n / 2) },
                  { creature: c.id, count: Math.floor(n / 2) },
                ]
              : [{ creature: c.id, count: n }];
          };
          const setup = gameSetup(
            seed,
            heroLessSide(a, split(ca), 1),
            heroLessSide(d, split(cd), 2),
          );
          const r = play(setup, { attacker: policy, defender: policy });
          games[a]++;
          games[d]++;
          if (r.winner === "attacker") wins[a]++;
          else if (r.winner === "defender") wins[d]++;
        }
      }
    console.log(
      `${String(tier + 1).padStart(4)}  ` +
        FACTIONS.map((f) => pct(wins[f], games[f]).padEnd(10)).join(""),
    );
  }
}

function tiersMode(): void {
  console.log(
    "tier  " +
      FACTIONS.map((f) => `${f.padEnd(34)}`).join("") +
      "\n      " +
      FACTIONS.map(() => "creature        cost    FV  FV/1000g  ").join(""),
  );
  const rosters = FACTIONS.map((f) => rosterOf(f));
  for (let tier = 0; tier < 6; tier++) {
    let line = `${String(tier + 1).padStart(4)}  `;
    for (const roster of rosters) {
      const c = roster[tier];
      if (!c) continue;
      const fv = creatureFightValue(c);
      const cost = creatureCost(c);
      line += `${c.id.padEnd(15)} ${String(cost).padStart(5)} ${String(fv).padStart(5)}  ${((1000 * fv) / cost).toFixed(0).padStart(6)}    `;
    }
    console.log(line);
  }
  console.log("\nweekly growth (all six dwellings): fight value and cost");
  for (const f of FACTIONS) {
    let fv = 0;
    let cost = 0;
    for (const c of rosterOf(f)) {
      fv += c.growth * creatureFightValue(c);
      cost += c.growth * creatureCost(c);
    }
    console.log(
      `${f.padEnd(9)} FV ${fv}  cost ${cost}  FV/1000g ${((1000 * fv) / cost).toFixed(0)}`,
    );
  }
  console.log("\nseeded armies (20 seeds): fight value per stage budget");
  for (const f of FACTIONS) {
    const parts = STAGE_IDS.map((st) => {
      let fv = 0;
      for (let i = 0; i < 20; i++)
        fv += armyFightValue(buildArmy(f, STAGES[st].budget, 1000 + i));
      return `${st} ${(fv / 20).toFixed(0)}`;
    });
    console.log(`${f.padEnd(9)} ${parts.join("  ")}`);
  }
}

export function main(args: readonly string[]): number {
  const opt = parseArgs(args);
  const mode = opt.get("mode") ?? "ai";
  const aSpec = opt.get("a") ?? "v2";
  const bSpec = opt.get("b") ?? (mode === "ai" ? "v1" : aSpec);
  const seeds = Number(opt.get("seeds") ?? "20");
  const budget = Number(opt.get("budget") ?? "12000");
  const level = Number(opt.get("level") ?? "6");
  const ratio = Number(opt.get("guard") ?? "0.8");
  const only = opt.get("only");
  const limit = opt.get("limit");
  limitOverride = limit === undefined ? undefined : Number(limit);
  const gearOpt = opt.get("gear") ?? "stage";
  if (gearOpt !== "stage" && gearOpt !== "bare")
    throw new Error(`unknown gear ${gearOpt}`);
  gear = gearOpt;
  const leanOpt = opt.get("lean");
  if (leanOpt !== undefined && leanOpt !== "might" && leanOpt !== "magic")
    throw new Error(`unknown lean ${leanOpt}`);
  leanOverride = leanOpt;
  const pairs = opt.get("pairs");
  pairFilter =
    pairs === undefined
      ? undefined
      : new Set(pairs.split(",").map((x) => x.trim()));
  const pf = opt.get("pf");
  if (pf !== undefined) {
    const [f, spec] = pf.split(/=(.*)/s) as [Faction, string | undefined];
    if (!FACTIONS.includes(f) || spec === undefined)
      throw new Error(`bad --pf ${pf}`);
    factionPolicy[f] = parsePolicy(spec);
  }
  const stageOpt = opt.get("stage");
  const stages: Stage[] =
    stageOpt === undefined || stageOpt === "all"
      ? STAGE_IDS
      : (stageOpt.split(",") as Stage[]);
  for (const st of stages)
    if (!(st in STAGES)) throw new Error(`unknown stage ${st}`);
  const heroOpt = opt.get("hero");
  const heroModes: HeroMode[] =
    heroOpt === undefined || heroOpt === "all"
      ? [...HERO_MODES]
      : (heroOpt.split(",") as HeroMode[]);
  const tweak = opt.get("tweak");
  if (tweak !== undefined) applyTweaks(tweak);
  if (mode === "duels") {
    duelsMode(parsePolicy(aSpec), seeds, Number(opt.get("budget") ?? "6000"));
    return 0;
  }
  if (mode === "tiers") {
    tiersMode();
    return 0;
  }
  if (mode === "timing") {
    const specs = [opt.get("a") ?? "v2", opt.get("b") ?? "v2-fast"];
    console.log(`timing: ${specs.join(" and ")}, ${seeds} battles per size`);
    timingMode(specs, seeds);
    return 0;
  }
  if (mode === "report") {
    const t0 = performance.now();
    console.log(
      `report: policy ${aSpec}, ${seeds} seeds per pairing, round limit ${limitOverride ?? "engine"}`,
    );
    reportMode(
      parsePolicy(aSpec),
      seeds,
      stages,
      heroModes,
      opt.has("matrix"),
      opt.has("acts"),
    );
    console.log(`wall ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    return 0;
  }
  if (mode === "guards") {
    const ratios = (opt.get("ratios") ?? "0.4,0.6,0.8,1.0")
      .split(",")
      .map(Number);
    console.log(`guards: policy ${aSpec}, ${seeds} seeds per faction`);
    guardsMode(parsePolicy(aSpec), seeds, stages, ratios);
    return 0;
  }
  const a = parsePolicy(aSpec);
  const b = parsePolicy(bSpec);
  const matchups = [
    ...(only === "neutral"
      ? []
      : factionMatchups(budget, level, heroModes[0] ?? "full")),
    ...(only === "faction" ? [] : neutralMatchups(budget, level, ratio)),
  ];
  const traceName = opt.get("trace");
  if (traceName !== undefined) {
    const m = matchups.find((x) => x.name === traceName);
    if (!m) throw new Error(`no matchup "${traceName}"`);
    const seed = Number(opt.get("seed") ?? "1000");
    const setup = m.setup(seed);
    for (const side of ["attacker", "defender"] as const)
      console.log(
        `${side}: ${setup[side].stacks.map((s) => `${s.count} ${s.creature}`).join(", ")}` +
          (setup[side].hero?.profile
            ? ` | level ${setup[side].hero.profile.level} A${setup[side].hero.attack} D${setup[side].hero.defense} P${setup[side].hero.profile.power} | pages ${setup[side].hero.profile.pages.join(" ")} mana ${setup[side].hero.profile.mana} scrolls ${setup[side].hero.profile.scrolls.join(" ")} command ${setup[side].hero.profile.command} C${setup[side].hero.profile.commandStrength} | morale ${setup[side].hero.profile.morale} luck ${setup[side].hero.profile.luck} | strikes ${setup[side].hero.profile.strikes.map((x) => x.label).join(", ")} | stacks ${setup[side].hero.profile.stacks.map((x) => x.label).join(", ")} | start ${setup[side].hero.profile.startRules.map((x) => x.source).join(", ")} | items ${setup[side].hero.profile.itemActs.join(" ")}`
            : ""),
      );
    const r = play(setup, { attacker: a, defender: b }, true);
    console.log(`winner ${r.winner} (${r.reason}) after ${r.rounds} rounds`);
    return r.illegal > 0 ? 1 : 0;
  }
  console.log(
    `mode ${mode}: A=${aSpec} B=${bSpec}, ${seeds} seeds, budget ${budget}, hero level ${level}`,
  );
  const rows: Row[] = [];
  const time = { a: 0, b: 0, aN: 0, bN: 0 };
  let illegal = 0;
  let battles = 0;
  const heroActs = { a: 0, b: 0 };
  const t0 = performance.now();
  for (const m of matchups) {
    const row: Row = {
      name: m.name,
      games: 0,
      aWins: 0,
      aAttWins: 0,
      bWins: 0,
      draws: 0,
      attackerWins: 0,
      rounds: 0,
      roundLimit: 0,
    };
    for (let i = 0; i < seeds; i++) {
      const setup = m.setup(1000 + i);
      const swaps = mode === "ai" ? [false, true] : [false];
      for (const swapped of swaps) {
        const aSide: BattleSide = swapped ? "defender" : "attacker";
        const r = play(setup, {
          attacker: swapped ? b : a,
          defender: swapped ? a : b,
        });
        battles++;
        illegal += r.illegal;
        const bSide: BattleSide =
          aSide === "attacker" ? "defender" : "attacker";
        time.a += r.ms[aSide];
        time.aN += r.decisions[aSide];
        time.b += r.ms[bSide];
        time.bN += r.decisions[bSide];
        heroActs.a += r.heroActs[aSide];
        heroActs.b += r.heroActs[bSide];
        row.games++;
        row.rounds += r.rounds;
        if (r.reason === "roundLimit") row.roundLimit++;
        if (r.winner === null) row.draws++;
        else {
          if (r.winner === "attacker") row.attackerWins++;
          if (r.winner === aSide) row.aWins++;
          else row.bWins++;
          if (r.winner === aSide && aSide === "attacker") row.aAttWins++;
        }
      }
    }
    rows.push(row);
  }
  const wall = performance.now() - t0;
  const head =
    mode === "ai"
      ? "matchup (attacker v defender)   games  A win  B win  att win  rounds  limit  A win as att / def"
      : "matchup (attacker v defender)   games  att win  rounds  limit";
  console.log(head);
  const tot: Row = {
    name: "total",
    games: 0,
    aWins: 0,
    aAttWins: 0,
    bWins: 0,
    draws: 0,
    attackerWins: 0,
    rounds: 0,
    roundLimit: 0,
  };
  for (const r of [...rows, tot]) {
    if (r !== tot) {
      tot.games += r.games;
      tot.aWins += r.aWins;
      tot.aAttWins += r.aAttWins;
      tot.bWins += r.bWins;
      tot.draws += r.draws;
      tot.attackerWins += r.attackerWins;
      tot.rounds += r.rounds;
      tot.roundLimit += r.roundLimit;
    }
    const name = r.name.padEnd(32);
    const rounds = (r.rounds / Math.max(1, r.games)).toFixed(1).padStart(6);
    console.log(
      mode === "ai"
        ? `${name}${String(r.games).padStart(5)}  ${pct(r.aWins, r.games)}   ${pct(r.bWins, r.games)}   ${pct(r.attackerWins, r.games)}  ${rounds}  ${String(r.roundLimit).padStart(5)}   ${pct(r.aAttWins, r.games / 2)} / ${pct(r.aWins - r.aAttWins, r.games / 2)}`
        : `${name}${String(r.games).padStart(5)}    ${pct(r.attackerWins, r.games)}  ${rounds}  ${String(r.roundLimit).padStart(5)}`,
    );
  }
  if (mode === "balance") {
    // Per faction: wins over both sides of every pairing against others.
    for (const f of FACTIONS) {
      let w = 0;
      let n = 0;
      for (const r of rows) {
        const [att, , def] = r.name.split(" ");
        if (def === "guard" || att === def) continue;
        if (att === f) {
          w += r.attackerWins;
          n += r.games;
        } else if (def === f) {
          w += r.games - r.attackerWins - r.draws;
          n += r.games;
        }
      }
      console.log(
        `${f.padEnd(10)} wins ${pct(w, n)} of ${n} cross-faction battles`,
      );
    }
  }
  console.log(
    `battles ${battles}, illegal actions ${illegal}, wall ${(wall / 1000).toFixed(1)} s (${(wall / Math.max(1, battles)).toFixed(0)} ms per battle)`,
  );
  console.log(
    `decision time: A ${(time.a / Math.max(1, time.aN)).toFixed(2)} ms over ${time.aN}, B ${(time.b / Math.max(1, time.bN)).toFixed(2)} ms over ${time.bN}; hero acts A ${heroActs.a}, B ${heroActs.b}`,
  );
  if (crashes.size > 0)
    console.log(
      `policy exceptions (the stack Defended instead): ${[...crashes].map(([k, v]) => `${k} ${v}`).join(", ")}`,
    );
  const json = opt.get("json");
  if (json !== undefined)
    writeFileSync(
      json,
      JSON.stringify({ args, rows, illegal, battles }, null, 2),
    );
  return illegal > 0 ? 1 : 0;
}
