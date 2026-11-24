/**
 * Save games in localStorage. The whole GameState (map included: the
 * generator may change between versions, so the save does not regenerate)
 * is plain JSON. Every storage access is wrapped: private windows, blocked
 * storage or a full quota just mean "no save".
 *
 * Versions: 3 is the multi-player state with heroes v2 (RULES_V2 sections
 * 3 to 5: stats, skills, feats, artifacts). A version 2 save (multi-player,
 * MVP heroes) is upgraded to v3; a version 1 save (the one-player MVP) is
 * upgraded into a one-player v3 game; an unreadable or unknown save is
 * reported with a message and not loaded.
 */
import {
  upgradeV1State,
  upgradeV2State,
  type V2State,
} from "../core/game/migrate.ts";
import type { GameState } from "../core/game/types.ts";

export const SAVE_KEY = "border-marches.save";
/** Bump when the GameState shape changes incompatibly. */
export const SAVE_VERSION = 3;

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

function looksLikeV2(s: GameState): boolean {
  return (
    typeof s.currentPlayer === "number" &&
    Array.isArray(s.pool) &&
    s.players.every(
      (p) =>
        typeof p.kind === "string" &&
        typeof p.faction === "string" &&
        p.tavern !== undefined,
    ) &&
    s.heroes.every((h) => typeof h.defId === "string")
  );
}

function looksLikeV3(s: GameState): boolean {
  return (
    looksLikeV2(s) &&
    s.heroes.every(
      (h) =>
        Array.isArray(h.worn) &&
        Array.isArray(h.backpack) &&
        Array.isArray(h.skills) &&
        typeof h.power === "number",
    )
  );
}

export type LoadResult =
  | { kind: "none" }
  | { kind: "ok"; state: GameState; upgraded: boolean }
  | { kind: "rejected"; message: string };

/**
 * Reads the save: the state (a v1 save upgraded), nothing, or a reason the
 * save cannot be used. A finished game counts as no save.
 */
export function readSave(storage: SaveStorage | null): LoadResult {
  if (storage === null) return { kind: "none" };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { kind: "none" };
  }
  if (raw === null) return { kind: "none" };
  let file: Partial<SaveFile>;
  try {
    file = JSON.parse(raw) as Partial<SaveFile>;
  } catch {
    return { kind: "rejected", message: "The saved game is damaged." };
  }
  if (!looksLikeState(file.state)) {
    return { kind: "rejected", message: "The saved game is damaged." };
  }
  if (file.version === 1) {
    try {
      const state = upgradeV1State(
        file.state as unknown as Parameters<typeof upgradeV1State>[0],
      );
      if (state.status !== "playing") return { kind: "none" };
      return { kind: "ok", state, upgraded: true };
    } catch (error) {
      return {
        kind: "rejected",
        message: `The old saved game cannot be upgraded: ${String(error)}`,
      };
    }
  }
  if (file.version === 2 && looksLikeV2(file.state)) {
    try {
      const state = upgradeV2State(file.state as unknown as V2State);
      if (state.status !== "playing") return { kind: "none" };
      return { kind: "ok", state, upgraded: true };
    } catch (error) {
      return {
        kind: "rejected",
        message: `The old saved game cannot be upgraded: ${String(error)}`,
      };
    }
  }
  if (file.version !== SAVE_VERSION || !looksLikeV3(file.state)) {
    return {
      kind: "rejected",
      message: `The saved game is from another version (${String(file.version)}).`,
    };
  }
  if (file.state.status !== "playing") return { kind: "none" };
  return { kind: "ok", state: file.state, upgraded: false };
}

/** The saved game, or null when there is none (or it is unusable). */
export function loadGame(storage: SaveStorage | null): GameState | null {
  const r = readSave(storage);
  return r.kind === "ok" ? r.state : null;
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
