/**
 * Sound hooks of the animation pass (bead bzc.26). Every visual effect has
 * an event name; {@link fxEvent} plays the sound registered for it, if any,
 * and tells listeners (tests, debug pages). The sound pass (bzc.27) fills
 * {@link FX_SOUNDS}; names without a sound are silent.
 *
 * Moments that already play a sound elsewhere (battle hits, shots and
 * deaths through `battleCue`, map steps, pickups, level-ups, new days and
 * weeks, builds and recruits through `playSound`) are not registered here
 * again, so nothing plays twice.
 */
import { SPELL_SCHOOL_SOUNDS, playSound } from "./sound.ts";
import type { PlayOptions, SoundId } from "./sound.ts";

const SCHOOLS = ["bloom", "accord", "clock", "hush", "storm"] as const;
type SchoolName = (typeof SCHOOLS)[number];

/** Shot kinds by shooter (render/fx/shots.ts). */
export const SHOT_KINDS = [
  "arrow",
  "spit",
  "orb",
  "wail",
  "bomb",
  "rock",
] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

/** Spell deliveries (render/fx/spell-fx.ts). */
export const SPELL_SHAPES = [
  "touch",
  "bolt",
  "burst",
  "beam",
  "ground",
  "summon",
  "wave",
  "tool",
] as const;
export type SpellShape = (typeof SPELL_SHAPES)[number];

/** Every effect event name, for the sound pass. */
export const FX_EVENTS = [
  // Battle: strikes, shots and damage.
  "battle.walk",
  "battle.lunge",
  "battle.impact",
  "battle.impact.heavy",
  "battle.retaliate",
  ...SHOT_KINDS.map((k) => `battle.shot.${k}` as const),
  "battle.shot.land",
  "battle.harm",
  "battle.kills",
  // Deaths and returns.
  "battle.death",
  "battle.remains",
  "battle.getup",
  "battle.summon",
  // Forced movement.
  "battle.push",
  "battle.launch",
  "battle.land",
  "battle.swap",
  "battle.teleport.out",
  "battle.teleport.in",
  // Conditions and links.
  "battle.condition.land",
  "battle.condition.expire",
  "battle.condition.refused",
  "battle.link.transfer",
  "battle.hold.frozen",
  "battle.hold.asleep",
  "battle.heartened",
  "battle.lucky",
  "battle.heal",
  "battle.ground.fire",
  "battle.ground.brambles",
  "battle.ground.mist",
  "battle.ground.other",
  // Acts.
  "battle.command",
  "battle.item",
  "battle.ability",
  "battle.wait",
  "battle.defend",
  // Turn flow.
  "battle.round",
  "battle.turn",
  "battle.timeline",
  // Spells: the cast flourish, the delivery and the impact.
  ...SCHOOLS.map((s) => `spell.cast.${s}` as const),
  ...SCHOOLS.flatMap((s) =>
    SPELL_SHAPES.map((k) => `spell.${k}.${s}` as const),
  ),
  ...SCHOOLS.map((s) => `spell.impact.${s}` as const),
  // Adventure map.
  "map.walk.bob",
  "map.pickup.fly",
  "map.pickup.land",
  "map.count.tick",
  "map.flag.raise",
  "map.levelup.burst",
  "map.day",
  "map.week",
  "map.fog.reveal",
  // Interface.
  "ui.dialog.open",
  "ui.dialog.close",
  "ui.tip",
  "ui.card.deal",
  "ui.page.turn",
  "ui.build.complete",
  "ui.recruit.count",
] as const;

export type FxEvent = (typeof FX_EVENTS)[number];

/**
 * The registered sounds. The five school cast sounds exist already; the
 * sound pass adds the rest.
 */
export const FX_SOUNDS: Partial<Record<FxEvent, SoundId>> = Object.fromEntries(
  SCHOOLS.map((s: SchoolName) => [`spell.cast.${s}`, SPELL_SCHOOL_SOUNDS[s]]),
);

export function soundForFx(name: FxEvent): SoundId | null {
  return FX_SOUNDS[name] ?? null;
}

const listeners = new Set<(name: FxEvent) => void>();

/** Listens to every effect event (tests and debug pages). */
export function onFxEvent(fn: (name: FxEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** An effect starts: play its sound if one is registered. */
export function fxEvent(name: FxEvent, options?: PlayOptions): void {
  for (const l of listeners) l(name);
  const id = soundForFx(name);
  if (id !== null) playSound(id, options);
}
