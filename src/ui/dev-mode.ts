/**
 * Dev mode (bead bzc.93): developer tools in the game Menu. On when the URL
 * says `?dev=1` (for that page load) or the Menu's "Developer tools" toggle
 * is on (stored in localStorage). Every storage access is wrapped: a
 * private window just means "off" unless the URL asks.
 */

export const DEV_MODE_KEY = "border-marches.dev";

/** The part of the Storage interface the setting uses (tests pass a fake). */
export interface DevStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** True when the query string asks for dev mode (`?dev=1` or `?dev=true`). */
export function devRequested(search: string): boolean {
  try {
    const v = new URLSearchParams(search).get("dev");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

/** The stored toggle (false when missing or unreadable). */
export function storedDevMode(storage: DevStorage | null): boolean {
  try {
    return storage?.getItem(DEV_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Stores the toggle; false when storage is unavailable. */
export function storeDevMode(storage: DevStorage | null, on: boolean): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(DEV_MODE_KEY, on ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}

function browserDevStorage(): DevStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function browserSearch(): string {
  try {
    return typeof location === "undefined" ? "" : location.search;
  } catch {
    return "";
  }
}

/** This page load's choice; null until first read. */
let current: boolean | null = null;

/** Whether dev mode is on now (the URL, else the stored toggle). */
export function devMode(): boolean {
  if (current === null) {
    current =
      devRequested(browserSearch()) || storedDevMode(browserDevStorage());
  }
  return current;
}

/** Turns dev mode on or off for this page and stores the choice. */
export function setDevMode(on: boolean): void {
  current = on;
  storeDevMode(browserDevStorage(), on);
}
