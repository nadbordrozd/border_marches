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
 *   --a v2 --b v1       policies: v1 (the frozen baseline), v2, v2-nohero
 *                       (no hero acts), or v2:<weight>=<n>,... overrides.
 *   --seeds 20          seeds per matchup
 *   --budget 12000      army budget in gold equivalents (tests/sim/armies.ts)
 *   --level 6           hero level
 *   --only faction|neutral   restrict the matchups
 *   --guard 0.8         neutral guard fight value / army fight value
 *   --json <file>       also write the raw results as JSON
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
import type { BattleSetup as GameBattleSetup } from "../../src/core/game/battle.ts";
import { chooseAiAction as chooseV1 } from "./ai-v1.ts";
import {
  FACTIONS,
  armyFightValue,
  buildArmy,
  buildGuard,
  buildHero,
  gameSetup,
  guardSide,
  heroSide,
} from "./armies.ts";
import type { Faction } from "./armies.ts";

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
  /** Fight value left at the end (survivors), per side. */
  readonly left: Record<BattleSide, number>;
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

export function play(
  setup: GameBattleSetup,
  policies: Record<BattleSide, Policy>,
  trace = false,
): Played {
  let state = createBattle(engineSetupFromGame(setup)).state;
  const decisions = { attacker: 0, defender: 0 };
  const ms = { attacker: 0, defender: 0 };
  const heroActs = { attacker: 0, defender: 0 };
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
    if (action.type === "heroAct") heroActs[side]++;
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
    left,
  };
}

interface Matchup {
  readonly name: string;
  /** The setup of seed i. */
  readonly setup: (seed: number) => GameBattleSetup;
}

function factionMatchups(budget: number, level: number): Matchup[] {
  const out: Matchup[] = [];
  for (const a of FACTIONS)
    for (const d of FACTIONS) {
      out.push({
        name: `${a} v ${d}`,
        setup: (seed) => {
          const la = seed % 2 === 0 ? "might" : "magic";
          const ld = (seed >> 1) % 2 === 0 ? "might" : "magic";
          return gameSetup(
            seed,
            heroSide(
              a,
              buildHero(a, level, seed, la),
              buildArmy(a, budget, seed),
              1,
            ),
            heroSide(
              d,
              buildHero(d, level, seed + 7777, ld),
              buildArmy(d, budget, seed + 7777),
              2,
            ),
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
): Matchup[] {
  return FACTIONS.map((f: Faction) => ({
    name: `${f} v guard`,
    setup: (seed: number) => {
      const army = buildArmy(f, budget, seed);
      const fv = armyFightValue(army) * ratio;
      const lean = seed % 2 === 0 ? "might" : "magic";
      return gameSetup(
        seed,
        heroSide(f, buildHero(f, level, seed, lean), army, 1),
        guardSide(buildGuard(fv, seed)),
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
  const a = parsePolicy(aSpec);
  const b = parsePolicy(bSpec);
  const matchups = [
    ...(only === "neutral" ? [] : factionMatchups(budget, level)),
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
            ? ` | pages ${setup[side].hero.profile.pages.join(" ")} mana ${setup[side].hero.profile.mana} scrolls ${setup[side].hero.profile.scrolls.join(" ")} command ${setup[side].hero.profile.command}`
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
