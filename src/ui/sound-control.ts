/**
 * The sound settings control (mute toggle, master and effects sliders) and
 * the page-wide UI sounds: a click on buttons, a soft tick when the mouse
 * enters one. Both are silent until the first gesture, in automated
 * browsers and while muted (see src/audio/sound.ts).
 */
import { playSound, sound } from "../audio/sound.ts";
import {
  MOTION_LABELS,
  motionPref,
  nextMotionPref,
  reducedMotion,
  setMotionPref,
} from "./motion.ts";
import type { AudioSettings } from "../audio/settings.ts";
import { el } from "./dom.ts";

const BUTTONS = "button, .gm-btn, .bm-btn, [role='button']";

function pressable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const b = target.closest<HTMLElement>(BUTTONS);
  if (b === null) return null;
  if (b instanceof HTMLButtonElement && b.disabled) return null;
  return b;
}

let installed = false;

/** Gesture unlock plus delegated click and hover sounds (once per page). */
export function installUiSounds(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const system = sound();
  system.attachGestureUnlock(window);
  document.addEventListener(
    "click",
    (e) => {
      if (pressable(e.target) !== null) playSound("ui.click");
    },
    true,
  );
  let hovered: HTMLElement | null = null;
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const b = pressable(e.target);
    if (b !== null && b !== hovered) playSound("ui.hover");
    hovered = b;
  });
}

function slider(
  label: string,
  value: number,
  onInput: (v: number) => void,
): { row: HTMLElement; input: HTMLInputElement } {
  const input = el("input.gm-sound-slider");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "5";
  input.value = String(Math.round(value * 100));
  input.setAttribute("aria-label", `${label} volume`);
  input.addEventListener("input", () => onInput(Number(input.value) / 100));
  input.addEventListener("change", () => playSound("ui.click"));
  return { row: el("label.gm-sound-row", el("span", label), input), input };
}

/** A compact sound settings block for the side panel or the menu. */
export function soundControl(): HTMLElement {
  const system = sound();
  const toggle = el("button.gm-btn.gm-sound-toggle");
  toggle.type = "button";
  toggle.addEventListener("click", () =>
    system.setMuted(!system.current.muted),
  );
  const master = slider("Master", system.current.master, (v) =>
    system.setMaster(v),
  );
  const effects = slider("Effects", system.current.effects, (v) =>
    system.setEffects(v),
  );
  // The motion setting lives with the sound settings (bead bzc.26).
  const motion = el("button.gm-btn.gm-motion-toggle");
  motion.type = "button";
  const syncMotion = (): void => {
    const p = motionPref();
    motion.textContent = MOTION_LABELS[p];
    motion.title =
      p === "auto"
        ? `Animations follow the system setting (now ${reducedMotion() ? "reduced" : "full"}); click for reduced`
        : p === "reduced"
          ? "No particles, slides or bobs; click for full motion"
          : "Every animation plays; click to follow the system setting";
    motion.setAttribute("aria-pressed", String(reducedMotion()));
  };
  motion.addEventListener("click", () => {
    setMotionPref(nextMotionPref(motionPref()));
    syncMotion();
  });
  syncMotion();
  const box = el("div.gm-sound", toggle, master.row, effects.row, motion);
  const sync = (s: Readonly<AudioSettings>): void => {
    toggle.textContent = s.muted ? "Sound: off" : "Sound: on";
    toggle.title = s.muted ? "Turn sound effects on" : "Mute all sound";
    toggle.setAttribute("aria-pressed", String(!s.muted));
    box.classList.toggle("gm-muted", s.muted);
    master.input.value = String(Math.round(s.master * 100));
    effects.input.value = String(Math.round(s.effects * 100));
  };
  sync(system.current);
  let seen = false;
  const stop = system.onChange((s) => {
    if (box.isConnected) seen = true;
    else if (seen) {
      stop();
      return;
    }
    sync(s);
  });
  return box;
}
