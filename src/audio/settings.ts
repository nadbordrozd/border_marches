/**
 * Sound settings: master volume, effects volume and mute, persisted in
 * localStorage. Every storage access is wrapped (private windows and blocked
 * storage just mean "defaults"). `?mute=1` in the URL makes mute the
 * default for that page load, whatever was stored.
 */

export const AUDIO_SETTINGS_KEY = "border-marches.audio";

export interface AudioSettings {
  /** 0..1 */
  master: number;
  /** 0..1 */
  effects: number;
  muted: boolean;
}

/** The part of the Storage interface the settings use (tests pass a fake). */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = {
  master: 0.8,
  effects: 0.8,
  muted: false,
};

function unit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

/** True when the query string asks for silence (`?mute=1`). */
export function muteRequested(search: string): boolean {
  try {
    const v = new URLSearchParams(search).get("mute");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

/** Stored settings (or defaults), with `?mute=1` forcing mute. */
export function loadAudioSettings(
  storage: SettingsStorage | null,
  search = "",
): AudioSettings {
  const out: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = storage?.getItem(AUDIO_SETTINGS_KEY) ?? null;
    if (raw !== null) {
      const data: unknown = JSON.parse(raw);
      if (typeof data === "object" && data !== null) {
        const d = data as Record<string, unknown>;
        out.master = unit(d["master"], out.master);
        out.effects = unit(d["effects"], out.effects);
        if (typeof d["muted"] === "boolean") out.muted = d["muted"];
      }
    }
  } catch {
    // Unreadable or corrupt: defaults.
  }
  if (muteRequested(search)) out.muted = true;
  return out;
}

/** Writes the settings; false when storage is unavailable or full. */
export function saveAudioSettings(
  storage: SettingsStorage | null,
  settings: AudioSettings,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(
      AUDIO_SETTINGS_KEY,
      JSON.stringify({
        master: unit(settings.master, DEFAULT_AUDIO_SETTINGS.master),
        effects: unit(settings.effects, DEFAULT_AUDIO_SETTINGS.effects),
        muted: settings.muted,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
