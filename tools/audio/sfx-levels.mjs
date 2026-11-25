#!/usr/bin/env node
// Loudness review and playback levels for the ElevenLabs effects.
//
//   node tools/audio/sfx-levels.mjs review         every raw take: duration, peak, loudness
//   node tools/audio/sfx-levels.mjs write          src/audio/levels.ts from the accepted files
//   node tools/audio/sfx-levels.mjs check          fails when levels.ts is stale
//
// Accepted files stay byte-identical to their recorded take (sfx.mjs
// validate checks the hashes), so loudness is normalised at playback: each
// sound gets a gain that brings its loudness to TARGET_DB plus a per-sound mix
// trim, capped so the peak stays under CEILING_DB, and a start offset that
// skips leading silence. Decoding needs ffmpeg on PATH (a dev tool only; the
// game never runs it). Nothing here plays a sound.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadConfig, readJson, sha256 } from "../art/lib/common.mjs";

const cfg = loadConfig();
const LEVELS_FILE = path.join(cfg.root, "src/audio/levels.ts");
const RATE = 44100;
/** Loudness (RMS over the audible part, dBFS) every effect is brought to. */
const TARGET_DB = -18;
/** Highest peak after the gain (dBFS): headroom for overlapping effects. */
const CEILING_DB = -1;
/** Mix trims in dB relative to TARGET_DB: background ticks sit lower. */
const TRIM_DB = {
  "ui.click": -6,
  "ui.hover": -12,
  "hero.step": -10,
  pickup: -3,
  gold: -3,
  build: -2,
  recruit: -2,
  "level-up": 0,
  "new-day": -4,
  "new-week": -2,
  "battle.hit": -3,
  "battle.heavy-hit": -1,
  "battle.shot": -5,
  "battle.death": -3,
  victory: 0,
  defeat: -1,
  "spell.bloom": -2,
  "spell.accord": -2,
  "spell.clock": -2,
  "spell.hush": -2,
  "spell.storm": -2,
  // Sound pass 2 (bzc.27). Shots, deliveries and impacts sit under the hits;
  // conditions, dialogs and ground are background detail; stings stay up.
  "shot.spit": -5,
  "shot.orb": -5,
  "shot.wail": -6,
  "shot.bomb": -5,
  "shot.rock": -5,
  "spell.bolt.bloom": -3,
  "spell.bolt.accord": -3,
  "spell.bolt.clock": -3,
  "spell.bolt.hush": -3,
  "spell.bolt.storm": -3,
  "spell.touch.bloom": -4,
  "spell.touch.accord": -4,
  "spell.touch.clock": -4,
  "spell.touch.hush": -4,
  "spell.burst.accord": -2,
  "spell.burst.clock": -2,
  "spell.burst.storm": -2,
  "spell.impact.bloom": -4,
  "spell.impact.accord": -4,
  "spell.impact.clock": -4,
  "spell.impact.hush": -4,
  "spell.impact.storm": -4,
  "battle.getup": -3,
  "battle.summon": -3,
  "battle.push": -5,
  "battle.launch": -5,
  "battle.land": -4,
  "battle.teleport": -5,
  "condition.land": -12,
  "condition.expire": -14,
  "condition.frozen": -5,
  "condition.asleep": -6,
  "battle.command": -1,
  "ground.fire": -6,
  "ground.brambles": -6,
  "ground.mist": -8,
  "map.flag": -6,
  "ui.dialog.open": -14,
  "ui.dialog.close": -14,
  "ui.build.complete": -4,
  "site.shrine": -3,
  "site.bank": -2,
  "site.treasure": -2,
  "site.waystone": -3,
  "site.gate": -3,
  "site.dig": -4,
  "site.quest": -1,
  "site.market": -3,
  "recruit.humans": -2,
  "recruit.undead": -2,
  "recruit.goblins": -2,
  "victory.humans": 0,
  "victory.undead": 0,
  "victory.goblins": 0,
  "town.humans": -8,
  "town.undead": -8,
  "town.goblins": -8,
};

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
const round = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;

/** Mono float samples of an audio file, through ffmpeg. */
function decode(file) {
  const out = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-ac",
      "1",
      "-ar",
      String(RATE),
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
  return new Float32Array(out.buffer, out.byteOffset, out.byteLength / 4);
}

/** Duration, peak, loudness of the audible part, leading silence, tail. */
export function analyse(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const floor = peak * 10 ** (-40 / 20);
  const onset = peak * 10 ** (-30 / 20);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < onset) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < floor) last--;
  let sum = 0;
  for (let i = first; i <= last; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, last - first + 1));
  // Loudest 100 ms window: how hard the attack lands.
  const win = Math.round(RATE / 10);
  let acc = 0;
  let maxWin = 0;
  for (let i = 0; i < samples.length; i++) {
    acc += samples[i] * samples[i];
    if (i >= win) acc -= samples[i - win] * samples[i - win];
    if (i >= win - 1 || i === samples.length - 1)
      maxWin = Math.max(maxWin, acc / Math.min(win, i + 1));
  }
  return {
    duration: samples.length / RATE,
    peakDb: db(peak),
    rmsDb: db(rms),
    shortDb: db(Math.sqrt(maxWin)),
    lead: first / RATE,
    audible: (last - first + 1) / RATE,
  };
}

function review() {
  const records = readJson(path.join(cfg.sfxDir, "records.json"), {});
  const verdicts = readJson(path.join(cfg.sfxDir, "verdicts.json"), {});
  const raw = path.join(cfg.rawDir, "sfx");
  console.log(
    "take                    dur   audible lead   peak   rms    max100ms verdict",
  );
  for (const [take, r] of Object.entries(records)) {
    const file = path.join(raw, r.file);
    if (!fs.existsSync(file)) {
      console.log(`${take.padEnd(23)} (raw take missing)`);
      continue;
    }
    const a = analyse(decode(file));
    console.log(
      [
        take.padEnd(23),
        a.duration.toFixed(2).padStart(5),
        a.audible.toFixed(2).padStart(7),
        a.lead.toFixed(2).padStart(5),
        a.peakDb.toFixed(1).padStart(6),
        a.rmsDb.toFixed(1).padStart(6),
        a.shortDb.toFixed(1).padStart(8),
        ` ${verdicts[take]?.verdict ?? "-"}`,
      ].join(" "),
    );
  }
}

function levels() {
  const prompts = readJson(path.join(cfg.sfxDir, "prompts.json"), {
    sounds: [],
  });
  const verdicts = readJson(path.join(cfg.sfxDir, "verdicts.json"), {});
  const lines = [];
  for (const s of prompts.sounds) {
    const accepted = Object.entries(verdicts).some(
      ([k, v]) => k.startsWith(`${s.id}#`) && v.verdict === "ACCEPTED",
    );
    if (!accepted || !s.output) continue;
    const file = path.join(cfg.root, s.output);
    const bytes = fs.readFileSync(file);
    const a = analyse(decode(file));
    const want = TARGET_DB + (TRIM_DB[s.id] ?? 0);
    const gainDb = Math.min(want - a.rmsDb, CEILING_DB - a.peakDb);
    const url = s.output.replace(/^public\//, "");
    lines.push(
      // Quotes only where needed, as prettier writes object keys.
      `  ${/^[A-Za-z_$][\w$]*$/.test(s.id) ? s.id : JSON.stringify(s.id)}: {\n` +
        `    url: ${JSON.stringify(url)},\n` +
        `    gain: ${round(10 ** (gainDb / 20), 3)},\n` +
        `    start: ${round(Math.max(0, a.lead - 0.005), 3)},\n` +
        `    duration: ${round(a.duration, 2)},\n` +
        `    peakDb: ${round(a.peakDb)},\n` +
        `    rmsDb: ${round(a.rmsDb)},\n` +
        `    sha256: ${JSON.stringify(sha256(bytes).slice(0, 16))},\n` +
        `  },`,
    );
  }
  return (
    "/**\n" +
    " * Playback levels of the accepted effects. GENERATED by\n" +
    " * `node tools/audio/sfx-levels.mjs write` from the files in public/sfx:\n" +
    ` * gain brings each to ${TARGET_DB} dBFS RMS plus its mix trim (peak capped at\n` +
    ` * ${CEILING_DB} dBFS); start skips leading silence (seconds). Do not edit.\n` +
    " */\n" +
    "export interface SoundLevel {\n" +
    "  readonly url: string;\n" +
    "  readonly gain: number;\n" +
    "  readonly start: number;\n" +
    "  readonly duration: number;\n" +
    "  readonly peakDb: number;\n" +
    "  readonly rmsDb: number;\n" +
    "  readonly sha256: string;\n" +
    "}\n\n" +
    "export const SOUND_LEVELS = {\n" +
    lines.join("\n") +
    "\n} as const satisfies Record<string, SoundLevel>;\n"
  );
}

const command = process.argv[2];
if (command === "review") review();
else if (command === "write") {
  fs.mkdirSync(path.dirname(LEVELS_FILE), { recursive: true });
  fs.writeFileSync(LEVELS_FILE, levels());
  console.log(`wrote ${path.relative(cfg.root, LEVELS_FILE)}`);
} else if (command === "check") {
  const current = fs.existsSync(LEVELS_FILE)
    ? fs.readFileSync(LEVELS_FILE, "utf8")
    : "";
  if (current !== levels()) {
    console.log(
      "FAIL src/audio/levels.ts is stale: run node tools/audio/sfx-levels.mjs write",
    );
    process.exit(1);
  }
  console.log("ok: src/audio/levels.ts matches the accepted effects");
} else {
  console.log("usage: node tools/audio/sfx-levels.mjs review | write | check");
  process.exit(command ? 1 : 0);
}
