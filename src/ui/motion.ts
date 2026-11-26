/**
 * The reduced-motion setting (bead bzc.26). Motion is reduced when the
 * player asks for it in the Menu, or, on "auto", when the operating system
 * asks for it (`prefers-reduced-motion`). Reduced motion means: no
 * particles, no lunges, arcs, bobs or slides (units and heroes snap), no
 * flying pickups, no pulsing; numbers and banners still appear, briefly and
 * in place. CSS reads `html[data-motion="reduced"]`.
 *
 * Every storage access is wrapped: a private window just means "auto".
 */

export type MotionPref = "auto" | "reduced" | "full";

export const MOTION_KEY = "border-marches.motion";

/** The part of the Storage interface the setting uses (tests pass a fake). */
export interface MotionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Whether motion is reduced for a preference and the OS wish. */
export function resolveReduced(pref: MotionPref, osReduced: boolean): boolean {
  return pref === "reduced" || (pref === "auto" && osReduced);
}

export function parseMotionPref(raw: string | null): MotionPref {
  return raw === "reduced" || raw === "full" ? raw : "auto";
}

function storage(): MotionStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function osQuery(): MediaQueryList | null {
  try {
    return typeof window === "undefined" || !window.matchMedia
      ? null
      : window.matchMedia("(prefers-reduced-motion: reduce)");
  } catch {
    return null;
  }
}

let pref: MotionPref | null = null;
let forced: boolean | null = null;
const listeners = new Set<(reduced: boolean) => void>();

function loadPref(): MotionPref {
  if (pref === null) {
    try {
      pref = parseMotionPref(storage()?.getItem(MOTION_KEY) ?? null);
    } catch {
      pref = "auto";
    }
  }
  return pref;
}

/** The stored preference. */
export function motionPref(): MotionPref {
  return loadPref();
}

/** True when animations should be reduced right now. */
export function reducedMotion(): boolean {
  if (forced !== null) return forced;
  return resolveReduced(loadPref(), osQuery()?.matches === true);
}

function applyRoot(): void {
  if (typeof document === "undefined") return;
  const reduced = reducedMotion();
  if (reduced) document.documentElement.dataset["motion"] = "reduced";
  else delete document.documentElement.dataset["motion"];
}

function changed(): void {
  applyRoot();
  const reduced = reducedMotion();
  for (const l of listeners) l(reduced);
}

export function setMotionPref(next: MotionPref): void {
  pref = next;
  try {
    storage()?.setItem(MOTION_KEY, next);
  } catch {
    // Unavailable storage: the choice lasts for this page.
  }
  changed();
}

/** Tests and debug pages: force reduced motion on or off (null: normal). */
export function forceReducedMotion(value: boolean | null): void {
  forced = value;
  changed();
}

export function onMotionChange(fn: (reduced: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let installed = false;

/** Sets the root attribute now and follows the OS setting. */
export function installMotion(): void {
  if (installed) return;
  installed = true;
  applyRoot();
  osQuery()?.addEventListener?.("change", changed);
}

// ------------------------------------------------------- animated terrain

/**
 * The "Animated terrain" setting (bead bzc.83): water glints, pulsing magma
 * and moving butterflies on the adventure map. On by default; it never
 * moves while motion is reduced.
 */
export const TERRAIN_MOTION_KEY = "border-marches.terrain-motion";

let terrainPref: boolean | null = null;

export function parseTerrainMotion(raw: string | null): boolean {
  return raw !== "off";
}

/** The stored "Animated terrain" setting (default on). */
export function terrainMotionPref(): boolean {
  if (terrainPref === null) {
    try {
      terrainPref = parseTerrainMotion(
        storage()?.getItem(TERRAIN_MOTION_KEY) ?? null,
      );
    } catch {
      terrainPref = true;
    }
  }
  return terrainPref;
}

export function setTerrainMotionPref(on: boolean): void {
  terrainPref = on;
  try {
    storage()?.setItem(TERRAIN_MOTION_KEY, on ? "on" : "off");
  } catch {
    // Unavailable storage: the choice lasts for this page.
  }
  changed();
}

/** Whether the map's terrain animates now: the setting, unless reduced. */
export function terrainAnimated(): boolean {
  return terrainMotionPref() && !reducedMotion();
}

export const MOTION_LABELS: Readonly<Record<MotionPref, string>> = {
  auto: "Motion: as the system",
  reduced: "Motion: reduced",
  full: "Motion: full",
};

export function nextMotionPref(p: MotionPref): MotionPref {
  return p === "auto" ? "reduced" : p === "reduced" ? "full" : "auto";
}
