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
 * The sound of each effect event (sound pass 2, bead bzc.27). Names not
 * listed are silent on purpose; docs/art/SOUND.md has the full table and
 * the reason for every silence (mostly: the moment already sounds through
 * `battleCue` or `playSound`, or it is too frequent to want a sound).
 *
 * Spells: every cast raises `spell.cast.<school>`, `spell.<shape>.<school>`
 * and `spell.impact.<school>` together. A shape with its own sound replaces
 * the school's cast sound (see {@link fxCues}); the other shapes fall back
 * to the cast sound. Bloom and Hush have no burst spells and Storm has no
 * touch spells, so those combinations have no file of their own.
 */
export const FX_SOUNDS: Partial<Record<FxEvent, SoundId>> = {
  ...Object.fromEntries(
    SCHOOLS.map((s: SchoolName) => [`spell.cast.${s}`, SPELL_SCHOOL_SOUNDS[s]]),
  ),
  "spell.bolt.bloom": "spell.bolt.bloom",
  "spell.touch.bloom": "spell.touch.bloom",
  "spell.bolt.accord": "spell.bolt.accord",
  "spell.touch.accord": "spell.touch.accord",
  "spell.burst.accord": "spell.burst.accord",
  "spell.bolt.clock": "spell.bolt.clock",
  "spell.touch.clock": "spell.touch.clock",
  "spell.burst.clock": "spell.burst.clock",
  "spell.bolt.hush": "spell.bolt.hush",
  "spell.touch.hush": "spell.touch.hush",
  "spell.bolt.storm": "spell.bolt.storm",
  "spell.burst.storm": "spell.burst.storm",
  ...Object.fromEntries(
    SCHOOLS.map((s: SchoolName) => [`spell.impact.${s}`, `spell.impact.${s}`]),
  ),
  // Shots: the arrow keeps the first pass's bow sound.
  "battle.shot.arrow": "battle.shot",
  "battle.shot.spit": "shot.spit",
  "battle.shot.orb": "shot.orb",
  "battle.shot.wail": "shot.wail",
  "battle.shot.bomb": "shot.bomb",
  "battle.shot.rock": "shot.rock",
  "battle.getup": "battle.getup",
  "battle.summon": "battle.summon",
  "battle.push": "battle.push",
  "battle.launch": "battle.launch",
  "battle.land": "battle.land",
  "battle.swap": "battle.teleport",
  "battle.teleport.out": "battle.teleport",
  "battle.condition.land": "condition.land",
  "battle.condition.expire": "condition.expire",
  "battle.condition.refused": "condition.expire",
  "battle.hold.frozen": "condition.frozen",
  "battle.hold.asleep": "condition.asleep",
  "battle.ground.fire": "ground.fire",
  "battle.ground.brambles": "ground.brambles",
  "battle.ground.mist": "ground.mist",
  "battle.command": "battle.command",
  "battle.item": "pickup",
  "map.flag.raise": "map.flag",
  "ui.dialog.open": "ui.dialog.open",
  "ui.dialog.close": "ui.dialog.close",
  "ui.build.complete": "ui.build.complete",
};

/**
 * How each sounding event plays: delays (seconds at speed 1) land a sound
 * with its visual, gaps throttle sounds that come in runs, jitter varies
 * the pitch of repeated hits.
 */
export const FX_OPTIONS: Partial<Record<FxEvent, PlayOptions>> = {
  ...Object.fromEntries(
    SHOT_KINDS.map((k) => [`battle.shot.${k}`, { jitter: 0.06, gap: 0.08 }]),
  ),
  ...Object.fromEntries(
    SCHOOLS.flatMap((s) =>
      SPELL_SHAPES.map((k) => [`spell.${k}.${s}`, { jitter: 0.03 }]),
    ),
  ),
  // The impact lands after the cast flourish and the delivery's travel.
  ...Object.fromEntries(
    SCHOOLS.map((s) => [
      `spell.impact.${s}`,
      { delay: 0.3, jitter: 0.05, gap: 0.1 },
    ]),
  ),
  "battle.getup": { jitter: 0.05, gap: 0.2 },
  "battle.summon": { gap: 0.2 },
  "battle.push": { jitter: 0.08, gap: 0.1 },
  "battle.launch": { jitter: 0.05 },
  "battle.land": { delay: 0.32, jitter: 0.08 },
  "battle.swap": { volume: 0.7, rate: 1.15 },
  "battle.teleport.out": { jitter: 0.04 },
  "battle.condition.land": { jitter: 0.1, gap: 0.15 },
  "battle.condition.expire": { jitter: 0.1, gap: 0.2 },
  "battle.condition.refused": { rate: 0.8, gap: 0.2 },
  "battle.hold.frozen": { jitter: 0.04, gap: 0.2 },
  "battle.hold.asleep": { gap: 0.3 },
  // A wall of fire or a bramble row spawns hex by hex: one sound per run.
  "battle.ground.fire": { jitter: 0.06, gap: 0.45 },
  "battle.ground.brambles": { jitter: 0.06, gap: 0.45 },
  "battle.ground.mist": { gap: 0.6 },
  "battle.item": { volume: 0.7 },
  "map.flag.raise": { jitter: 0.04, gap: 0.3 },
  // After the hammer knocks of "build".
  "ui.build.complete": { delay: 0.5 },
};

/**
 * Within one beat, a more specific event's sound replaces the general one:
 * a held condition replaces the generic condition chime.
 */
const SUPERSEDES: Partial<Record<FxEvent, FxEvent>> = {
  "battle.hold.frozen": "battle.condition.land",
  "battle.hold.asleep": "battle.condition.land",
};

export function soundForFx(name: FxEvent): SoundId | null {
  return FX_SOUNDS[name] ?? null;
}

const listeners = new Set<(name: FxEvent) => void>();

/** Listens to every effect event (tests and debug pages). */
export function onFxEvent(fn: (name: FxEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface FxPlay extends PlayOptions {
  /** Animation speed: registered delays are divided by it (default 1). */
  speed?: number;
}

function playFx(name: FxEvent, id: SoundId, options: FxPlay): void {
  const { speed = 1, ...own } = options;
  const merged: PlayOptions = { ...FX_OPTIONS[name], ...own };
  if (merged.delay !== undefined && own.delay === undefined)
    merged.delay /= Math.max(1, speed);
  playSound(id, merged);
}

/** An effect starts: play its sound if one is registered. */
export function fxEvent(name: FxEvent, options: FxPlay = {}): void {
  for (const l of listeners) l(name);
  const id = soundForFx(name);
  if (id !== null) playFx(name, id, options);
}

/**
 * The sounds a group of simultaneous events (one battle beat) makes: each
 * sound once, a shape's own sound instead of its school's cast sound, a
 * specific condition instead of the generic one.
 */
export function cueSounds(
  cues: readonly FxEvent[],
): Array<{ name: FxEvent; id: SoundId }> {
  const dropped = new Set<FxEvent>();
  for (const c of cues) {
    const m = /^spell\.(\w+)\.(\w+)$/.exec(c);
    if (m !== null && m[1] !== "cast" && m[1] !== "impact") {
      const cast = `spell.cast.${m[2]}` as FxEvent;
      if (soundForFx(c) !== null) dropped.add(cast);
    }
    const general = SUPERSEDES[c];
    if (general !== undefined && soundForFx(c) !== null) dropped.add(general);
  }
  const seen = new Set<SoundId>();
  const out: Array<{ name: FxEvent; id: SoundId }> = [];
  for (const name of cues) {
    const id = soundForFx(name);
    if (id === null || dropped.has(name) || seen.has(id)) continue;
    seen.add(id);
    out.push({ name, id });
  }
  return out;
}

/** A beat's events start together (see {@link cueSounds}). */
export function fxCues(cues: readonly FxEvent[], options: FxPlay = {}): void {
  for (const name of cues) for (const l of listeners) l(name);
  for (const { name, id } of cueSounds(cues)) playFx(name, id, options);
}
