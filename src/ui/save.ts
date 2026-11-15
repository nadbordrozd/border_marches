/**
 * Save games in localStorage. The whole GameState (map included: the
 * generator may change between versions, so the save does not regenerate)
 * is plain JSON. Every storage access is wrapped: private windows, blocked
 * storage or a full quota just mean "no save".
 */
import type { GameState } from "../core/game/types.ts";

export const SAVE_KEY = "border-marches.save";
/** Bump when the GameState shape changes incompatibly. */
export const SAVE_VERSION = 1;

/** The part of the Storage interface the save uses (tests pass a fake). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SaveFile {
  version: number;
  state: GameState;
}

/** window.localStorage, or null when it cannot be reached. */
export function browserStorage(): SaveStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Writes the state; false when storage is unavailable or full. */
export function saveGame(
  storage: SaveStorage | null,
  state: GameState,
): boolean {
  if (storage === null) return false;
  try {
    const file: SaveFile = { version: SAVE_VERSION, state };
    storage.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

function looksLikeState(value: unknown): value is GameState {
  if (value === null || typeof value !== "object") return false;
  const s = value as Partial<GameState>;
  return (
    typeof s.day === "number" &&
    typeof s.status === "string" &&
    Array.isArray(s.players) &&
    Array.isArray(s.heroes) &&
    s.map !== undefined &&
    Array.isArray(s.map.cells) &&
    Array.isArray(s.map.objects) &&
    s.map.cells.length === s.map.width * s.map.height
  );
}

/** The saved game, or null when there is none (or it is unreadable). */
export function loadGame(storage: SaveStorage | null): GameState | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const file = JSON.parse(raw) as Partial<SaveFile>;
    if (file.version !== SAVE_VERSION || !looksLikeState(file.state)) {
      return null;
    }
    if (file.state.status !== "playing") return null;
    return file.state;
  } catch {
    return null;
  }
}

export function hasSave(storage: SaveStorage | null): boolean {
  return loadGame(storage) !== null;
}

export function deleteSave(storage: SaveStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // nothing to do
  }
}
