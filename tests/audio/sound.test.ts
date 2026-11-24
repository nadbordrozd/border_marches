import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { battleCue, pickupCue } from "../../src/audio/cues.ts";
import { SOUND_LEVELS } from "../../src/audio/levels.ts";
import {
  AUDIO_SETTINGS_KEY,
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  muteRequested,
  saveAudioSettings,
} from "../../src/audio/settings.ts";
import type { SettingsStorage } from "../../src/audio/settings.ts";
import {
  isAutomatedEnvironment,
  playSound,
  sound,
  SOUND_IDS,
  SoundSystem,
  SPELL_SCHOOL_SOUNDS,
} from "../../src/audio/sound.ts";
import type { AudioEnv } from "../../src/audio/sound.ts";
import type {
  BattleCreatureStats,
  BattleEvent,
  BattleStackSetup,
} from "../../src/core/battle/index.ts";
import { at, battle } from "../ui/battle/helpers.ts";

/** A made-up creature, so the test does not depend on the roster. */
function stack(tier: number, count: number, col: number): BattleStackSetup {
  const creature: BattleCreatureStats = {
    id: `tier${tier}`,
    tier,
    hp: 10,
    attack: 5,
    defense: 5,
    damage: 3,
    speed: 5,
    abilities: [],
  };
  return { creature, count, hex: at(col, 0) };
}

function fakeStorage(): SettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const brokenStorage: SettingsStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

interface FakeAudio {
  contexts: number;
  started: number;
  fetched: string[];
}

/** A stand-in AudioContext that records what would have played. */
function fakeContext(log: FakeAudio): AudioContext {
  const param = () => ({
    value: 1,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
  });
  const node = () => ({
    gain: param(),
    connect: () => undefined,
    disconnect: () => undefined,
  });
  const ctx = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: () => Promise.resolve(),
    createGain: node,
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      playbackRate: param(),
      onended: null,
      start: () => void log.started++,
      stop: () => undefined,
    }),
    decodeAudioData: () => Promise.resolve({ duration: 0.5 }),
  };
  return ctx as unknown as AudioContext;
}

function env(over: Partial<AudioEnv> = {}): {
  env: AudioEnv;
  log: FakeAudio;
  storage: ReturnType<typeof fakeStorage>;
} {
  const log: FakeAudio = { contexts: 0, started: 0, fetched: [] };
  const storage = fakeStorage();
  let t = 0;
  return {
    log,
    storage,
    env: {
      automated: false,
      storage,
      search: "",
      createContext: () => {
        log.contexts++;
        return fakeContext(log);
      },
      fetchBytes: (path) => {
        log.fetched.push(path);
        return Promise.resolve(new ArrayBuffer(8));
      },
      now: () => (t += 1),
      random: () => 0.5,
      ...over,
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("audio settings", () => {
  it("defaults when nothing is stored, and persists changes", () => {
    const storage = fakeStorage();
    expect(loadAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(
      saveAudioSettings(storage, { master: 0.3, effects: 0.6, muted: true }),
    ).toBe(true);
    expect(loadAudioSettings(storage)).toEqual({
      master: 0.3,
      effects: 0.6,
      muted: true,
    });
  });

  it("makes mute the default with ?mute=1", () => {
    const storage = fakeStorage();
    saveAudioSettings(storage, { master: 1, effects: 1, muted: false });
    expect(muteRequested("?mute=1")).toBe(true);
    expect(muteRequested("?view=battle&mute=1")).toBe(true);
    expect(muteRequested("?mute=0")).toBe(false);
    expect(loadAudioSettings(storage, "?seed=4&mute=1").muted).toBe(true);
    expect(loadAudioSettings(null, "?mute=1").muted).toBe(true);
    expect(loadAudioSettings(storage, "?seed=4").muted).toBe(false);
  });

  it("survives blocked, corrupt or out-of-range storage", () => {
    expect(loadAudioSettings(brokenStorage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(saveAudioSettings(brokenStorage, DEFAULT_AUDIO_SETTINGS)).toBe(
      false,
    );
    expect(saveAudioSettings(null, DEFAULT_AUDIO_SETTINGS)).toBe(false);
    const storage = fakeStorage();
    storage.data.set(AUDIO_SETTINGS_KEY, "{not json");
    expect(loadAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    storage.data.set(
      AUDIO_SETTINGS_KEY,
      JSON.stringify({ master: 7, effects: -1, muted: "yes" }),
    );
    expect(loadAudioSettings(storage)).toEqual({
      master: 1,
      effects: 0,
      muted: false,
    });
  });
});

describe("sound system", () => {
  it("detects tests, headless and automated browsers", () => {
    const ua = "Mozilla/5.0 (Macintosh) Chrome/140.0 Safari/537.36";
    expect(isAutomatedEnvironment({ userAgent: ua }, "development")).toBe(
      false,
    );
    expect(
      isAutomatedEnvironment({ webdriver: true, userAgent: ua }, "production"),
    ).toBe(true);
    expect(
      isAutomatedEnvironment(
        { userAgent: "Mozilla/5.0 HeadlessChrome/140.0" },
        "production",
      ),
    ).toBe(true);
    expect(isAutomatedEnvironment({ userAgent: ua }, "test")).toBe(true);
    expect(isAutomatedEnvironment(undefined, "production")).toBe(true);
  });

  it("never plays in tests: the game's own system is silent", () => {
    sound().unlock();
    expect(sound().play("ui.click")).toBe(false);
    playSound("victory");
    expect(sound().started).toBe(false);
    expect(sound().played).toBe(0);
  });

  it("never plays or creates a context when webdriver is set", async () => {
    const { env: e, log } = env({ automated: true });
    const system = new SoundSystem(e);
    system.unlock();
    await flush();
    expect(system.play("ui.click")).toBe(false);
    expect(log).toEqual({ contexts: 0, started: 0, fetched: [] });
  });

  it("stays silent and loads nothing before the first gesture", async () => {
    const { env: e, log } = env();
    const system = new SoundSystem(e);
    expect(system.play("ui.click")).toBe(false);
    await flush();
    expect(log).toEqual({ contexts: 0, started: 0, fetched: [] });
  });

  it("plays after a gesture, lazily loading the files", async () => {
    const { env: e, log } = env();
    const system = new SoundSystem(e);
    system.unlock();
    expect(log.contexts).toBe(1);
    for (let i = 0; i < 30; i++) await flush();
    expect(log.fetched).toContain("sfx/ui-click.mp3");
    expect(system.play("ui.click")).toBe(true);
    expect(log.started).toBe(1);
    system.unlock();
    expect(log.contexts).toBe(1);
  });

  it("starts muted with ?mute=1 and plays once unmuted", async () => {
    const { env: e, log, storage } = env({ search: "?mute=1" });
    const system = new SoundSystem(e);
    expect(system.current.muted).toBe(true);
    system.unlock();
    expect(system.play("gold")).toBe(false);
    expect(log.contexts).toBe(0);
    system.setMuted(false);
    expect(log.contexts).toBe(1);
    expect(loadAudioSettings(storage).muted).toBe(false);
    for (let i = 0; i < 30; i++) await flush();
    expect(system.play("gold")).toBe(true);
    system.setMuted(true);
    expect(system.play("pickup")).toBe(false);
    expect(log.started).toBe(1);
  });

  it("persists volumes and is silent at zero effects volume", () => {
    const { env: e, storage } = env();
    const system = new SoundSystem(e);
    const seen: number[] = [];
    system.onChange((s) => seen.push(s.master));
    system.setMaster(0.25);
    system.setEffects(0);
    expect(seen).toEqual([0.25, 0.25]);
    expect(loadAudioSettings(storage)).toEqual({
      master: 0.25,
      effects: 0,
      muted: false,
    });
    system.unlock();
    expect(system.audible).toBe(false);
    expect(system.play("build")).toBe(false);
    expect(new SoundSystem(e).current.master).toBe(0.25);
  });
});

describe("sound set and cues", () => {
  it("has a level for every recorded effect, and its file", () => {
    const prompts = JSON.parse(
      readFileSync("audio/sfx/prompts.json", "utf8"),
    ) as { sounds: Array<{ id: string; output: string }> };
    expect([...SOUND_IDS].sort()).toEqual(
      prompts.sounds.map((s) => s.id).sort(),
    );
    for (const s of prompts.sounds) {
      const level = SOUND_LEVELS[s.id as keyof typeof SOUND_LEVELS];
      expect(`public/${level.url}`).toBe(s.output);
      expect(existsSync(s.output)).toBe(true);
      expect(level.gain).toBeGreaterThan(0);
      expect(level.gain).toBeLessThanOrEqual(8);
      // Gain keeps every peak under 0 dBFS.
      expect(level.peakDb + 20 * Math.log10(level.gain)).toBeLessThan(0);
    }
    for (const id of Object.values(SPELL_SCHOOL_SOUNDS))
      expect(SOUND_IDS).toContain(id);
  });

  it("maps battle events to shots, hits, heavy hits and deaths", () => {
    const state = battle([stack(2, 10, 0), stack(5, 2, 1)], [stack(2, 20, 14)]);
    const raptor = state.stacks.find((s) => s.id === "a0");
    const big = state.stacks.find((s) => s.id === "a1");
    expect(raptor?.creature.tier).toBeLessThan(4);
    expect(big?.creature.tier).toBeGreaterThanOrEqual(4);
    const meta = { index: 0, cause: null, rule: "engine" } as const;
    const damage = (sourceId: string, dmg: number): BattleEvent => ({
      ...meta,
      type: "damage",
      sourceId,
      targetId: "d0",
      kind: "melee",
      damage: dmg,
      kills: 0,
      hpLost: 0,
      countAfter: 20,
      topHpAfter: 1,
      breakdown: {} as never,
      redirectedTo: null,
    });
    expect(battleCue(damage("a0", 5), state)).toBe("battle.hit");
    expect(battleCue(damage("a1", 5), state)).toBe("battle.heavy-hit");
    expect(battleCue(damage("a0", 100_000), state)).toBe("battle.heavy-hit");
    expect(
      battleCue(
        { ...meta, type: "shoot", stackId: "a0", targetId: "d0" },
        state,
      ),
    ).toBe("battle.shot");
    expect(battleCue({ ...meta, type: "death", stackId: "d0" }, state)).toBe(
      "battle.death",
    );
    expect(
      battleCue({ ...meta, type: "wait", stackId: "a0" }, state),
    ).toBeNull();
    expect(pickupCue("gold")).toBe("gold");
    expect(pickupCue("wood")).toBe("pickup");
  });
});
