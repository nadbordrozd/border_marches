/**
 * Headless AI-against-AI matches with per-day metrics (simulation tier,
 * never the unit tier; bead bzc.19).
 *
 *   node tools/sim/run-ts.mjs tools/sim/match.ts [options]
 *
 * Options:
 *   --ai v1|simple       controller for every player (default v1)
 *   --size S|M|L         map size (default S)
 *   --players 2|3|4      players (default 2)
 *   --seeds 11,12        map and game seeds (default 11,12)
 *   --days 84            days to play (default 84, three months)
 *   --every 7            print a table row every N days (default 7)
 *   --map <id>           a named map (keepers-toll, hourglass-marches)
 *                        instead of a generated one; its own size,
 *                        players and factions (the seeds then only feed
 *                        battles and taverns)
 *   --trace <p>[:a-b]    print player p's actions on days a..b
 *   --explain <p>:<day>  print player p's targets and view on that day
 *   --idle <p>           player p only ends its turns (a passive human)
 *   --no-families        no fight predictions from earlier fights of a
 *                        family (iteration 2 ablation)
 *   --no-openings        no faction openings in week one (ablation)
 *   --out <file.json>    save every day's metrics (default
 *                        .orchestration/sim/match-<ai>-<size><players>.json)
 *
 * Prints, per seed and checkpoint day, one row per player: army fight
 * value, main hero's fight value, gold income, mines, towns, heroes,
 * explored share, guards cleared, top level, artifacts, idle heroes; then
 * the slowest and mean turn times.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AdventureAi } from "../../src/core/ai/index.ts";
import { playMatch, type PlayerMetrics } from "../../src/core/ai/match.ts";
import { createBattleResolver } from "../../src/core/battle/resolver.ts";
import {
  SimpleAi,
  type AiStepResult,
  type GameAction,
  type GameState,
  type PlayerController,
} from "../../src/core/game/index.ts";
import { registerSpells } from "../../src/core/magic/index.ts";
import { mapToAscii } from "../../src/core/map/ascii.ts";
import type { MapSize } from "../../src/core/map/generate.ts";

const args = process.argv.slice(2);
function opt(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
}

const aiName = opt("ai", "v1");
const size = opt("size", "S") as MapSize;
const players = Number(opt("players", "2"));
const seeds = opt("seeds", "11,12")
  .split(",")
  .map((s) => Number(s.trim()));
const days = Number(opt("days", "84"));
const every = Number(opt("every", "7"));
const idleArg = opt("idle", "");
const idlePlayer = idleArg === "" ? null : Number(idleArg);
const namedId = opt("map", "");
const named = namedId === "" ? undefined : namedId;
const out = opt(
  "out",
  `.orchestration/sim/match-${aiName}-${named ?? `${size}${players}`}.json`,
);

const traceArg = opt("trace", "");
/** --trace <player>[:<from day>-<to day>]: print that player's actions. */
const trace =
  traceArg === ""
    ? null
    : {
        player: Number(traceArg.split(":")[0]),
        from: Number(traceArg.split(":")[1]?.split("-")[0] ?? 1),
        to: Number(traceArg.split(":")[1]?.split("-")[1] ?? 9999),
      };

registerSpells();
const resolver = createBattleResolver();

function describe(a: GameAction, before: GameState): string {
  switch (a.type) {
    case "move": {
      const h = before.heroes.find((x) => x.id === a.heroId);
      const last = a.path[a.path.length - 1];
      return `move ${a.heroId} (${h?.x},${h?.y})->(${last?.x},${last?.y}) mp ${h?.mp}`;
    }
    case "recruit":
      return `recruit ${a.count} ${a.creature} @${a.townId} -> ${a.to ?? ""}`;
    case "transfer":
      return `transfer ${JSON.stringify(a.args)}`;
    default:
      return JSON.stringify(a);
  }
}

function traceStep(before: GameState, step: AiStepResult): void {
  if (trace === null || before.currentPlayer !== trace.player) return;
  if (before.day < trace.from || before.day > trace.to) return;
  const a = step.action;
  const res = before.players[trace.player]?.resources;
  const line = a === null ? "(none)" : describe(a, before);
  const ev = step.events
    .filter((e) =>
      [
        "battle",
        "monster-defeated",
        "hero-defeated",
        "hero-retreated",
        "town-captured",
        "mine-flagged",
        "site",
        "pickup",
        "hero-hired",
        "level-up",
      ].includes(e.type),
    )
    .map((e) =>
      e.type === "site"
        ? `site:${e.text}`
        : e.type === "battle"
          ? `battle:${e.battle.kind}:${e.battle.objectId}`
          : e.type === "pickup"
            ? `pickup:${e.amount} ${e.resource}`
            : e.type,
    );
  console.log(
    `  d${before.day} p${trace.player} g${res?.gold} w${res?.wood} o${res?.ore} e${res?.essence} | ${line}${ev.length > 0 ? ` | ${ev.join("; ")}` : ""}`,
  );
}

/** --explain <player>:<day>: print that player's targets at its turn start. */
const explainArg = opt("explain", "");
const explain =
  explainArg === ""
    ? null
    : {
        player: Number(explainArg.split(":")[0]),
        day: Number(explainArg.split(":")[1] ?? 1),
      };
let current: AdventureAi | null = null;

function makeController(): (player: number) => PlayerController {
  if (aiName === "simple") {
    const ai = new SimpleAi();
    return () => ai;
  }
  // The AI's own simulated fights use its default resolver (a round
  // limit for estimates); the match's battles use the game's.
  const ai = new AdventureAi({
    families: !args.includes("--no-families"),
    openings: !args.includes("--no-openings"),
  });
  current = ai;
  // --idle <p>: that player only ends its turns (a passive human).
  const passive: PlayerController = { decide: () => ({ type: "end-turn" }) };
  return (p) => (idlePlayer === p ? passive : ai);
}

let explained = false;
function explainStep(before: GameState): void {
  if (explain === null || current === null || explained) return;
  if (before.day !== explain.day || before.currentPlayer !== explain.player)
    return;
  explained = true;
  console.log(`-- explain p${explain.player} day ${explain.day}`);
  for (const l of current.explain(before, explain.player)) console.log(l);
  // The player's view: fog blank, live stacks X, heroes by owner digit.
  const rows = mapToAscii(before.map, { cellWidth: 1, shapes: true }).split(
    "\n",
  );
  const w = before.map.width;
  const explored = before.players[explain.player]?.explored ?? [];
  const grid = rows.map((r) => r.padEnd(w, " ").split(""));
  for (const o of before.map.objects) {
    if (o.kind === "monster" && before.monsters[o.id] === undefined) {
      const row = grid[o.y];
      if (row) row[o.x] = ".";
    }
    if (o.kind === "pickup" && before.collected.includes(o.id)) {
      const row = grid[o.y];
      if (row) row[o.x] = ".";
    }
  }
  for (const h of before.heroes) {
    if (!h.alive) continue;
    const row = grid[h.y];
    if (row) row[h.x] = String(h.owner);
  }
  grid.forEach((row, y) =>
    row.forEach((_, x) => {
      if (explored[y * w + x] !== true) row[x] = " ";
    }),
  );
  console.log(grid.map((r) => `|${r.join("")}|`).join("\n"));
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
function percentile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  );
}
function row(m: PlayerMetrics, guards: number): string {
  return [
    `d${m.day}`.padEnd(4),
    `p${m.player} ${m.faction.slice(0, 6)}`.padEnd(10),
    String(m.armyFv).padStart(7),
    String(m.mainFv).padStart(7),
    String(m.income).padStart(6),
    String(m.mines).padStart(3),
    String(m.towns).padStart(3),
    String(m.heroes).padStart(3),
    pct(m.explored).padStart(5),
    `${m.guardsCleared}/${guards - m.guardsLeft}/${guards}`.padStart(9),
    String(m.neutralTowns).padStart(2),
    String(m.level).padStart(3),
    String(m.artifacts).padStart(3),
    String(m.idleHeroes).padStart(3),
    String(m.buildings).padStart(4),
    m.eliminated ? " OUT" : "",
  ].join(" ");
}

// guards: cleared by the player / cleared by anyone / at start;
// nt: neutral towns left on the map.
const header =
  "day  player       army    main income min twn her  expl    guards nt lvl art idl bld";
const saved: unknown[] = [];
for (const seed of seeds) {
  console.log(
    `\n== ${aiName} seed ${seed} ${named !== undefined ? `map ${named}` : `size ${size} players ${players}`} days ${days}`,
  );
  console.log(header);
  const controller = makeController();
  const result = playMatch({
    seed,
    size,
    players,
    ...(named === undefined ? {} : { named }),
    days,
    controller,
    resolver,
    ...(trace === null && explain === null
      ? {}
      : {
          onAction: (before: GameState, step: AiStepResult) => {
            explainStep(before);
            traceStep(before, step);
          },
        }),
    onDay: (metrics, _state, guards) => {
      const d = metrics[0]?.day ?? 0;
      if (d % every !== 0 && d !== days) return;
      for (const m of metrics) console.log(row(m, guards));
    },
  });
  const guards = result.guardsAtStart;
  const all = result.turnMs.flat();
  const max = Math.max(0, ...all);
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const think = result.thinkMs.flat();
  const thinkMax = Math.max(0, ...think);
  const thinkMean =
    think.reduce((a, b) => a + b, 0) / Math.max(1, think.length);
  console.log(
    `guards at start ${guards}; status ${result.state.status}; turn ms mean ${mean.toFixed(0)} max ${max.toFixed(0)} (deciding: mean ${thinkMean.toFixed(0)} max ${thinkMax.toFixed(0)}); refused actions ${result.failures.length}; last stands ${result.lastStands}; void battles ${result.battleErrors.length}`,
  );
  // Human-relevant summary (bead bzc.21): when players first fight, when
  // a town first falls, how much of the map is cleared by month two.
  const d56 = result.days[Math.min(55, result.days.length - 1)]?.[0];
  const cleared56 =
    d56 === undefined || guards === 0 ? 0 : (guards - d56.guardsLeft) / guards;
  const last = result.days[result.days.length - 1] ?? [];
  console.log(
    `SUMMARY seed ${seed} first-player-fight d${result.firstPlayerFight ?? "-"} first-town-loss d${result.firstTownLoss ?? "-"} player-fights ${result.playerFights.length} guards-cleared-d56 ${pct(cleared56)} eliminated ${result.eliminatedOn.map((d) => d ?? "-").join("/")} army-end ${last.map((m) => m.armyFv).join("/")} turn-ms mean ${mean.toFixed(0)} max ${max.toFixed(0)} p95 ${percentile(all, 0.95).toFixed(0)} last-stands ${result.lastStands} void ${result.battleErrors.length} sims ${current?.simulations ?? 0} inferred ${current?.inferred ?? 0} deferred ${current?.deferrals ?? 0}`,
  );
  for (const b of result.battleErrors.slice(0, 5)) {
    console.log(`  void battle d${b.day} p${b.player}: ${b.message}`);
  }
  for (const f of result.failures.slice(0, 5)) {
    console.log(
      `  refused d${f.day} p${f.player}: ${JSON.stringify(f.action)}`,
    );
  }
  saved.push({
    seed,
    size,
    players,
    map: named ?? null,
    ai: aiName,
    guardsAtStart: guards,
    status: result.state.status,
    turnMs: { mean, max },
    thinkMs: { mean: thinkMean, max: thinkMax },
    failures: result.failures,
    firstPlayerFight: result.firstPlayerFight,
    firstTownLoss: result.firstTownLoss,
    playerFights: result.playerFights,
    eliminatedOn: result.eliminatedOn,
    guardsClearedD56: cleared56,
    turnP95: percentile(all, 0.95),
    battleErrors: result.battleErrors,
    lastStands: result.lastStands,
    days: result.days,
  });
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(saved, null, 1));
console.log(`\nsaved ${out}`);
