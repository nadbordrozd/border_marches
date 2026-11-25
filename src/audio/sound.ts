/**
 * The sound system: lazily loaded effects through Web Audio, with master
 * and effects volume and mute (see settings.ts).
 *
 * It never makes a sound
 * - in tests (Vite mode "test") or outside a browser,
 * - in automated or headless browsers (`navigator.webdriver`, HeadlessChrome),
 * - before the first user gesture (the AudioContext is created on it),
 * - while muted (`?mute=1` makes mute the default) or at zero volume.
 *
 * Files are fetched and decoded on first use after that gesture (the rest are
 * warmed in the background once sound is on), so nothing is downloaded on page
 * load. Each file plays at its measured gain from levels.ts, so the set is
 * loudness-matched while the files stay byte-identical to their recorded takes.
 */
import { SOUND_LEVELS } from "./levels.ts";
import type { SoundLevel } from "./levels.ts";
import { loadAudioSettings, saveAudioSettings } from "./settings.ts";
import type { AudioSettings, SettingsStorage } from "./settings.ts";

export type SoundId = keyof typeof SOUND_LEVELS;

export const SOUND_IDS = Object.keys(SOUND_LEVELS) as SoundId[];

/** The spell-cast sound of each school (wired by the spell beads). */
export const SPELL_SCHOOL_SOUNDS = {
  bloom: "spell.bloom",
  accord: "spell.accord",
  clock: "spell.clock",
  hush: "spell.hush",
  storm: "spell.storm",
} as const satisfies Record<string, SoundId>;

export interface PlayOptions {
  /** Extra volume factor, 0..1 (default 1). */
  volume?: number;
  /** Playback rate (default 1). */
  rate?: number;
  /** Random rate variation, e.g. 0.06 for +-6% (default 0). */
  jitter?: number;
  /** Start this many seconds from now (default 0): lands with its visual. */
  delay?: number;
  /**
   * The same sound again within this many seconds is dropped (default
   * MIN_GAP): longer for sounds that come in runs (ground, conditions).
   */
  gap?: number;
}

/** What the system needs from its surroundings (tests pass fakes). */
export interface AudioEnv {
  /** True in tests, headless or automated browsers: never play anything. */
  readonly automated: boolean;
  readonly storage: SettingsStorage | null;
  /** location.search, for `?mute=1`. */
  readonly search: string;
  /** Called at most once, on the first user gesture with sound on. */
  createContext(): AudioContext | null;
  /** Fetches a file of public/ (path relative to the site base). */
  fetchBytes(path: string): Promise<ArrayBuffer>;
  /** Seconds, for throttling (performance.now() / 1000 in the browser). */
  now(): number;
  random(): number;
}

/** Same sound again within this many seconds is dropped. */
const MIN_GAP = 0.045;
/** Simultaneous voices at most: a busy beat drops its extras, not the mix. */
export const MAX_VOICES = 10;
/** A sound still loading is dropped when it is ready later than this. */
const MAX_LATE = 0.35;
/** Fade at the end of every sound against clicks from cut-off takes. */
const FADE_OUT = 0.03;

const perceptual = (v: number): number => v * v;

export class SoundSystem {
  private settings: AudioSettings;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private gestured = false;
  private voices = 0;
  private readonly buffers = new Map<SoundId, Promise<AudioBuffer | null>>();
  private readonly ready = new Map<SoundId, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private readonly listeners = new Set<(s: AudioSettings) => void>();
  /** Sounds started (for tests and the browser check). */
  played = 0;

  constructor(private readonly env: AudioEnv) {
    this.settings = loadAudioSettings(env.storage, env.search);
  }

  get current(): Readonly<AudioSettings> {
    return this.settings;
  }

  /** Whether a play() would make a sound right now. */
  get audible(): boolean {
    return (
      !this.env.automated &&
      this.gestured &&
      this.ctx !== null &&
      !this.settings.muted &&
      this.settings.master > 0 &&
      this.settings.effects > 0
    );
  }

  /** Whether an AudioContext exists (only after a gesture with sound on). */
  get started(): boolean {
    return this.ctx !== null;
  }

  // ------------------------------------------------------------ settings

  setMuted(muted: boolean): void {
    this.update({ muted });
  }

  setMaster(volume: number): void {
    this.update({ master: Math.min(1, Math.max(0, volume)) });
  }

  setEffects(volume: number): void {
    this.update({ effects: Math.min(1, Math.max(0, volume)) });
  }

  onChange(listener: (s: AudioSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(change: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...change };
    saveAudioSettings(this.env.storage, this.settings);
    this.applyVolumes();
    // A settings change is itself a gesture: sound may start now.
    if (this.gestured) this.start();
    for (const l of this.listeners) l(this.settings);
  }

  private applyVolumes(): void {
    if (this.masterGain !== null)
      this.masterGain.gain.value = this.settings.muted
        ? 0
        : perceptual(this.settings.master);
    if (this.effectsGain !== null)
      this.effectsGain.gain.value = perceptual(this.settings.effects);
  }

  // ------------------------------------------------------------ lifecycle

  /** Call from a user gesture handler: allows sound from now on. */
  unlock(): void {
    if (this.env.automated) return;
    this.gestured = true;
    this.start();
  }

  /** Unlocks on the first pointer or key gesture on `target`. */
  attachGestureUnlock(target: EventTarget): void {
    if (this.env.automated) return;
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const handler = (): void => {
      this.unlock();
      for (const e of events) target.removeEventListener(e, handler, true);
    };
    for (const e of events) target.addEventListener(e, handler, true);
  }

  private start(): void {
    if (this.ctx !== null) {
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(noop);
      return;
    }
    if (
      this.env.automated ||
      !this.gestured ||
      this.settings.muted ||
      this.settings.master <= 0 ||
      this.settings.effects <= 0
    )
      return;
    let ctx: AudioContext | null;
    try {
      ctx = this.env.createContext();
    } catch {
      ctx = null;
    }
    if (ctx === null) return;
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.effectsGain = ctx.createGain();
    this.effectsGain.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
    this.applyVolumes();
    if (ctx.state === "suspended") void ctx.resume().catch(noop);
    this.warm();
  }

  /** Loads every effect in the background, a few at a time. */
  private warm(): void {
    const queue = [...SOUND_IDS];
    const next = (): void => {
      const id = queue.shift();
      if (id !== undefined) void this.load(id).then(next);
    };
    for (let i = 0; i < 3; i++) next();
  }

  private load(id: SoundId): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (p === undefined) {
      const ctx = this.ctx;
      const level: SoundLevel = SOUND_LEVELS[id];
      p =
        ctx === null
          ? Promise.resolve(null)
          : this.env
              .fetchBytes(level.url)
              .then((bytes) => ctx.decodeAudioData(bytes))
              .then((buffer) => {
                this.ready.set(id, buffer);
                return buffer;
              })
              .catch(() => null);
      if (ctx !== null) this.buffers.set(id, p);
    }
    return p;
  }

  // ------------------------------------------------------------ playing

  /** Plays an effect; false when it was not started (silent, throttled...). */
  play(id: SoundId, options: PlayOptions = {}): boolean {
    if (!this.audible || this.ctx === null) return false;
    const t = this.env.now();
    const last = this.lastPlayed.get(id);
    if (last !== undefined && t - last < (options.gap ?? MIN_GAP)) return false;
    if (this.voices >= MAX_VOICES) return false;
    this.lastPlayed.set(id, t);
    const buffer = this.ready.get(id);
    if (buffer !== undefined) return this.startVoice(id, buffer, options);
    void this.load(id).then((b) => {
      if (b !== null && this.env.now() - t <= MAX_LATE && this.audible)
        this.startVoice(id, b, options);
    });
    return true;
  }

  private startVoice(
    id: SoundId,
    buffer: AudioBuffer,
    options: PlayOptions,
  ): boolean {
    const ctx = this.ctx;
    if (ctx === null || this.effectsGain === null) return false;
    const level: SoundLevel = SOUND_LEVELS[id];
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const jitter = options.jitter ?? 0;
      const rate =
        (options.rate ?? 1) * (1 + (this.env.random() * 2 - 1) * jitter);
      source.playbackRate.value = rate;
      const gain = ctx.createGain();
      const volume = level.gain * Math.min(1, Math.max(0, options.volume ?? 1));
      const now = ctx.currentTime + Math.max(0, options.delay ?? 0);
      const end = now + Math.max(0.01, (buffer.duration - level.start) / rate);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.setValueAtTime(volume, Math.max(now, end - FADE_OUT));
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain);
      gain.connect(this.effectsGain);
      source.onended = () => {
        this.voices--;
        source.disconnect();
        gain.disconnect();
      };
      source.start(now, level.start);
      source.stop(end + 0.01);
      this.voices++;
      this.played++;
      return true;
    } catch {
      return false;
    }
  }
}

function noop(): void {}

/** Tests, non-browsers, and automated or headless browsers. */
export function isAutomatedEnvironment(
  nav: { webdriver?: boolean; userAgent?: string } | undefined,
  mode: string,
): boolean {
  if (mode === "test" || nav === undefined) return true;
  if (nav.webdriver === true) return true;
  return /HeadlessChrome/i.test(nav.userAgent ?? "");
}

function browserEnv(): AudioEnv {
  const hasWindow = typeof window !== "undefined";
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  let storage: SettingsStorage | null;
  try {
    storage = hasWindow ? window.localStorage : null;
  } catch {
    storage = null;
  }
  const base = import.meta.env.BASE_URL;
  return {
    automated: !hasWindow || isAutomatedEnvironment(nav, import.meta.env.MODE),
    storage,
    search: hasWindow ? window.location.search : "",
    createContext: () =>
      typeof AudioContext === "undefined" ? null : new AudioContext(),
    fetchBytes: async (path) => {
      const response = await fetch(`${base}${path}`);
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response.arrayBuffer();
    },
    now: () => performance.now() / 1000,
    random: () => Math.random(),
  };
}

let shared: SoundSystem | null = null;

/** The game's sound system (created on first use). */
export function sound(): SoundSystem {
  shared ??= new SoundSystem(browserEnv());
  return shared;
}

/** Plays an effect on the game's sound system (silent when not allowed). */
export function playSound(id: SoundId, options?: PlayOptions): void {
  sound().play(id, options);
}
