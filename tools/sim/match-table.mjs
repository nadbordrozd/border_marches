#!/usr/bin/env node
/**
 * Before-and-after tables of match runs (AI iteration 3, bead bzc.23).
 *
 *   node tools/sim/match-table.mjs <dir> <before-tag> <after-tag> [names]
 *
 * Reads `<dir>/<tag>-<name>.json` as saved by tools/sim/match.ts (--out)
 * for each name (default S2,M3,KT,HG,S2i,M3i,KTi,HGi: all-AI and
 * passive-human runs of S 2p, M 3p and the two named maps) and prints one
 * markdown row per map and seed, "before → after", then the means.
 * Without an after tag (`-`) it prints the before run alone.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [dir = ".orchestration/sim", before, after = "-", namesArg] =
  process.argv.slice(2);
if (before === undefined) {
  console.error(
    "usage: match-table.mjs <dir> <before-tag> [after-tag] [names]",
  );
  process.exit(2);
}
const names = (namesArg ?? "S2,M3,KT,HG,S2i,M3i,KTi,HGi").split(",");
const LABEL = {
  S2: "S, 2 players",
  M3: "M, 3 players",
  KT: "Keepers' Toll",
  HG: "Hourglass (L)",
};

function load(tag, name) {
  const f = resolve(dir, `${tag}-${name}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

/** The numbers of one seed's run. */
function stats(run, passive) {
  const days = run.days;
  const last = days[days.length - 1] ?? [];
  const d56 = days[Math.min(55, days.length - 1)] ?? [];
  const d42 = days[Math.min(41, days.length - 1)] ?? [];
  const g = run.guardsAtStart;
  const left56 = d56[0]?.guardsLeft ?? g;
  const elim = run.eliminatedOn;
  const ai = passive ? elim.slice(1) : elim;
  const aiOut = ai.filter((d) => d !== null);
  // Idle hero-days of the AI players (heroes that did not move on a day).
  let idle = 0;
  let heroDays = 0;
  for (const day of days) {
    for (const m of day) {
      if (passive && m.player === 0) continue;
      if (m.eliminated) continue;
      idle += m.idleHeroes;
      heroDays += m.heroes;
    }
  }
  const aiArmy = (ms) =>
    Math.max(
      0,
      ...ms.filter((m) => !(passive && m.player === 0)).map((m) => m.armyFv),
    );
  // Towns taken from a player that had taken them within two weeks.
  const taken = run.townsTaken ?? [];
  const flips = taken.filter((t, i) =>
    taken.slice(0, i).some((u) => u.town === t.town && t.day - u.day <= 14),
  ).length;
  return {
    flips,
    taken: taken.length,
    pvp1: run.firstPlayerFight ?? 85,
    town1: run.firstTownLoss ?? 85,
    elim1: aiOut.length === 0 ? 85 : Math.min(...aiOut),
    human: passive ? (elim[0] ?? 85) : null,
    fights: run.playerFights.length,
    guards56: g === 0 ? 1 : (g - left56) / g,
    nt56: d56[0]?.neutralTowns ?? 0,
    army42: aiArmy(d42),
    army84: aiArmy(last),
    idle: heroDays === 0 ? 0 : idle / heroDays,
    p95: run.turnP95,
    max: run.turnMs.max,
    think: run.thinkMs.max,
  };
}

const fmtDay = (d) => (d >= 85 ? "-" : String(d));
const k = (x) => `${Math.round(x / 1000)}k`;
const pct = (x) => `${Math.round(x * 100)}%`;
const ms = (x) => String(Math.round(x));
const COLS = [
  ["1st PvP fight", (s) => fmtDay(s.pvp1)],
  ["1st town lost", (s) => fmtDay(s.town1)],
  ["1st AI out", (s) => fmtDay(s.elim1)],
  ["PvP fights", (s) => String(s.fights)],
  ["Towns taken (flips)", (s) => `${s.taken} (${s.flips})`],
  ["Guards d56", (s) => pct(s.guards56)],
  ["Neutral towns d56", (s) => String(s.nt56)],
  ["AI army d42", (s) => k(s.army42)],
  ["Leader d84", (s) => k(s.army84)],
  ["Idle hero-days", (s) => pct(s.idle)],
  ["Turn p95", (s) => ms(s.p95)],
  ["Turn max", (s) => ms(s.max)],
];
const MEANS = [
  ["First player-against-player battle (day)", "pvp1"],
  ["First town lost (day)", "town1"],
  ["First AI eliminated (day; 85 if none)", "elim1"],
  ["Human eliminated (day; 85 if none)", "human"],
  ["Player-against-player battles per match", "fights"],
  ["Towns taken from a player per match", "taken"],
  ["Of them retaken within two weeks (flips)", "flips"],
  ["Guards cleared by day 56", "guards56", pct],
  ["Neutral towns left on day 56", "nt56"],
  ["Strongest AI army on day 42", "army42", k],
  ["Leader's army on day 84", "army84", k],
  ["Idle hero-days (AI)", "idle", pct],
  ["Turn ms p95", "p95", ms],
  ["Turn ms max", "max", ms],
  ["Deciding ms max", "think", ms],
];

for (const group of [
  names.filter((n) => !n.endsWith("i")),
  names.filter((n) => n.endsWith("i")),
]) {
  if (group.length === 0) continue;
  const passive = group[0].endsWith("i");
  const cols = passive
    ? [["Human out", (s) => fmtDay(s.human)], ...COLS]
    : COLS;
  console.log(
    `\n### ${passive ? "Player 0 passive (--idle 0)" : "Every player an AI"}\n`,
  );
  console.log(`| Map | Seed | ${cols.map((c) => c[0]).join(" | ")} |`);
  console.log(`| --- | --- | ${cols.map(() => "---").join(" | ")} |`);
  const all = { b: [], a: [] };
  for (const name of group) {
    const b = load(before, name);
    const a = after === "-" ? null : load(after, name);
    if (b === null) continue;
    b.forEach((run, i) => {
      const sb = stats(run, passive);
      const ra = a?.[i];
      const sa = ra === undefined ? null : stats(ra, passive);
      all.b.push(sb);
      if (sa !== null) all.a.push(sa);
      const cells = cols.map(([, f]) =>
        sa === null ? f(sb) : `${f(sb)} → ${f(sa)}`,
      );
      console.log(
        `| ${LABEL[name.replace(/i$/, "")] ?? name} | ${run.seed} | ${cells.join(" | ")} |`,
      );
    });
  }
  const mean = (xs, key) =>
    xs.reduce((n, s) => n + (s[key] ?? 0), 0) / Math.max(1, xs.length);
  console.log(`\n| Metric | Before | ${after === "-" ? "" : "After |"}`);
  console.log(`| --- | --- | ${after === "-" ? "" : "--- |"}`);
  for (const [label, key, f = (x) => x.toFixed(1)] of MEANS) {
    if (key === "human" && !passive) continue;
    const early = (xs) => xs.filter((s) => s.elim1 <= 21).length;
    console.log(
      `| ${label} | ${f(mean(all.b, key))} | ${after === "-" ? "" : `${f(mean(all.a, key))} |`}`,
    );
    if (key === "elim1") {
      console.log(
        `| AI eliminations by day 21 | ${early(all.b)} | ${after === "-" ? "" : `${early(all.a)} |`}`,
      );
    }
  }
}
