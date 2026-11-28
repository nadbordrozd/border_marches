/**
 * The animation scheduler (bead bzc.26): turns one batch of engine events
 * into beats, in event-index order, each with its effect names (the sound
 * hooks) and how long it holds the screen. Pure: it reads the states and
 * never changes them, and the engine never waits for it (animations change
 * neither game state nor its timing).
 *
 * - Instant speed (and quick battles): every beat lasts 0 ms, nothing is
 *   decorated and no effect names are raised.
 * - Reduced motion: no tweens and no particles; beats that carry news
 *   (damage, deaths, conditions, casts) hold briefly so they can be read.
 * - Otherwise the full timings, divided by the speed.
 */
import { DECK_GUN_EFFECT, act, hasAct } from "../../core/battle/index.ts";
import type {
  BattleEvent,
  BattleState,
  School,
} from "../../core/battle/index.ts";
import type { FxEvent } from "../../audio/fx.ts";
import { spellFx } from "../../render/fx/spell-fx.ts";
import type { ResolvedSpellFx } from "../../render/fx/spell-fx.ts";
import { shotKind } from "../../render/fx/shots.ts";
import { battleCue } from "../../audio/cues.ts";

/** Base durations in ms at speed 1. Each beat stays under 400 ms. */
export const DURATIONS = {
  hopMax: 110,
  walkMax: 380,
  lunge: 240,
  shot: 260,
  hit: 220,
  death: 340,
  getUp: 360,
  text: 160,
  round: 220,
  textLife: 900,
  cast: 380,
  command: 380,
  item: 300,
  ability: 240,
  push: 220,
  launch: 380,
  teleport: 300,
  swap: 300,
  conditionLand: 200,
  conditionExpire: 160,
  ground: 140,
  summon: 340,
  link: 200,
} as const;

/** Each further ground feature of a run, after the first. */
export const GROUND_FOLLOW = 30;

/** What a beat holds under reduced motion (news only, read in place). */
export const REDUCED_HOLD = {
  hit: 180,
  death: 160,
  cast: 220,
  condition: 120,
  round: 120,
  text: 120,
} as const;

/** One hop of a walk: at most 110 ms, and the whole walk at most 380 ms. */
export function hopDuration(pathLength: number): number {
  if (pathLength <= 0) return 0;
  return Math.min(DURATIONS.hopMax, DURATIONS.walkMax / pathLength);
}

export interface PlanOptions {
  /** Animation speed: 1, 2, 4 or Infinity (instant). */
  readonly speed: number;
  readonly reduced: boolean;
}

export interface Beat {
  /** Position in the plan. */
  readonly order: number;
  /** The event's own index (EventMeta.index). */
  readonly index: number;
  readonly event: BattleEvent;
  /** Effect names, in the order they start (each may play a sound). */
  readonly cues: readonly FxEvent[];
  /** Duration at speed 1 in the current motion mode. */
  readonly base: number;
  /** Real duration: base / speed, 0 when instant. */
  readonly ms: number;
  /** Particles and other decoration may be drawn. */
  readonly decorate: boolean;
  /** Units may tween (lunges, walks, arcs); otherwise they snap. */
  readonly motion: boolean;
  /** For casts and acts: the look of the act. */
  readonly look?: ResolvedSpellFx;
  readonly actKind?: "ability" | "cast" | "command" | "item";
}

/** The kind and school of an act, if it is registered. */
export function actInfo(
  id: string,
): { kind: "ability" | "cast" | "command" | "item"; school?: School } | null {
  if (!hasAct(id)) return null;
  const def = act(id);
  return def.school === undefined
    ? { kind: def.kind }
    : { kind: def.kind, school: def.school };
}

function groundCue(kind: string): FxEvent {
  return kind === "fire" || kind === "brambles" || kind === "mist"
    ? (`battle.ground.${kind}` as FxEvent)
    : "battle.ground.other";
}

function castCues(look: ResolvedSpellFx, act: string): FxEvent[] {
  // Tidal Wave has its own crash for cast, delivery and impact (NAVAL 11).
  if (act === "tidal-wave") return ["spell.tidal-wave"];
  const s = look.school;
  return [
    `spell.cast.${s}` as FxEvent,
    `spell.${look.shape}.${s}` as FxEvent,
    `spell.impact.${s}` as FxEvent,
  ];
}

/** The full-motion duration and effect names of one event. */
function describe(
  e: BattleEvent,
  before: BattleState,
): {
  base: number;
  reducedBase: number;
  cues: FxEvent[];
  look?: ResolvedSpellFx;
  actKind?: "ability" | "cast" | "command" | "item";
} {
  switch (e.type) {
    case "roundStart":
      return {
        base: DURATIONS.round,
        reducedBase: REDUCED_HOLD.round,
        cues: ["battle.round"],
      };
    case "turnStart":
      return {
        base: 0,
        reducedBase: 0,
        cues: ["battle.turn", "battle.timeline"],
      };
    case "move": {
      if (e.mode === "teleport")
        return {
          base: DURATIONS.teleport,
          reducedBase: 0,
          cues: ["battle.teleport.out", "battle.teleport.in"],
        };
      if (e.mode === "swap")
        return { base: DURATIONS.swap, reducedBase: 0, cues: ["battle.swap"] };
      if (e.mode === "push" || e.mode === "pull") {
        if (e.rule === "launched")
          return {
            base: DURATIONS.launch,
            reducedBase: 0,
            cues: ["battle.launch", "battle.land"],
          };
        return { base: DURATIONS.push, reducedBase: 0, cues: ["battle.push"] };
      }
      return {
        base: hopDuration(e.path.length) * e.path.length,
        reducedBase: 0,
        cues: e.path.length > 0 ? ["battle.walk"] : [],
      };
    }
    case "attack":
      return { base: DURATIONS.lunge, reducedBase: 0, cues: ["battle.lunge"] };
    case "retaliation":
      return {
        base: DURATIONS.lunge,
        reducedBase: 0,
        cues: ["battle.retaliate", "battle.lunge"],
      };
    case "shoot":
    case "shootHex": {
      const shooter = before.stacks.find((s) => s.id === e.stackId);
      const kind = shotKind(shooter?.creature.id ?? "");
      return {
        base: DURATIONS.shot,
        reducedBase: 0,
        cues: [`battle.shot.${kind}` as FxEvent],
      };
    }
    case "damage": {
      const cues: FxEvent[] = [
        e.kind === "shot"
          ? "battle.shot.land"
          : battleCue(e, before) === "battle.heavy-hit"
            ? "battle.impact.heavy"
            : "battle.impact",
      ];
      if (e.kills > 0) cues.push("battle.kills");
      return { base: DURATIONS.hit, reducedBase: REDUCED_HOLD.hit, cues };
    }
    case "harm": {
      if (e.harm === 0) return { base: 0, reducedBase: 0, cues: [] };
      const cues: FxEvent[] = ["battle.harm"];
      if (e.kills > 0) cues.push("battle.kills");
      return { base: DURATIONS.hit, reducedBase: REDUCED_HOLD.hit, cues };
    }
    case "death":
      return {
        base: DURATIONS.death,
        reducedBase: REDUCED_HOLD.death,
        cues: ["battle.death", "battle.remains"],
      };
    case "getUp":
      return {
        base: DURATIONS.getUp,
        reducedBase: REDUCED_HOLD.text,
        cues: ["battle.getup"],
      };
    case "summon":
      return {
        base: DURATIONS.summon,
        reducedBase: REDUCED_HOLD.text,
        cues: ["battle.summon"],
      };
    case "condition": {
      const k = e.condition.kind;
      if (
        e.change === "landed" ||
        e.change === "moved" ||
        e.change === "copied"
      ) {
        const cues: FxEvent[] = ["battle.condition.land"];
        if (k === "frozen") cues.push("battle.hold.frozen");
        if (k === "asleep") cues.push("battle.hold.asleep");
        if (k === "heartened") cues.push("battle.heartened");
        if (k === "lucky") cues.push("battle.lucky");
        return {
          base: DURATIONS.conditionLand,
          reducedBase: REDUCED_HOLD.condition,
          cues,
        };
      }
      if (e.change === "refused")
        return {
          base: DURATIONS.conditionLand,
          reducedBase: REDUCED_HOLD.condition,
          cues: ["battle.condition.refused"],
        };
      if (
        e.change === "expired" ||
        e.change === "ended" ||
        e.change === "displaced" ||
        e.change === "setOff"
      )
        return {
          base: DURATIONS.conditionExpire,
          reducedBase: REDUCED_HOLD.condition,
          cues: ["battle.condition.expire"],
        };
      return { base: 0, reducedBase: 0, cues: [] };
    }
    case "linkTransfer":
      return {
        base: DURATIONS.link,
        reducedBase: REDUCED_HOLD.text,
        cues: ["battle.link.transfer"],
      };
    case "turnSkipped":
      return { base: DURATIONS.text, reducedBase: REDUCED_HOLD.text, cues: [] };
    case "ground":
      return e.change === "added"
        ? {
            base: DURATIONS.ground,
            reducedBase: 0,
            cues: [groundCue(e.feature.kind)],
          }
        : { base: 0, reducedBase: 0, cues: [] };
    case "heal":
      return {
        base: DURATIONS.text,
        reducedBase: REDUCED_HOLD.text,
        cues: ["battle.heal"],
      };
    case "wait":
      return {
        base: DURATIONS.text,
        reducedBase: REDUCED_HOLD.text,
        cues: ["battle.wait"],
      };
    case "defend":
      return {
        base: DURATIONS.text,
        reducedBase: REDUCED_HOLD.text,
        cues: ["battle.defend"],
      };
    case "heroAct": {
      const info = actInfo(e.act);
      const kind = info?.kind ?? "cast";
      if (kind === "command")
        return {
          base: DURATIONS.command,
          reducedBase: REDUCED_HOLD.cast,
          cues: ["battle.command"],
          actKind: kind,
        };
      if (kind === "item")
        return {
          base: DURATIONS.item,
          reducedBase: REDUCED_HOLD.cast,
          cues: ["battle.item"],
          actKind: kind,
        };
      if (kind === "ability")
        return {
          base: DURATIONS.ability,
          reducedBase: REDUCED_HOLD.text,
          cues: ["battle.ability"],
          actKind: kind,
        };
      const look = spellFx(e.act, info?.school);
      return {
        base: DURATIONS.cast,
        reducedBase: REDUCED_HOLD.cast,
        cues: castCues(look, e.act),
        look,
        actKind: "cast",
      };
    }
    case "creatureCast": {
      const look = spellFx(e.spell, actInfo(e.spell)?.school);
      return {
        base: DURATIONS.cast,
        reducedBase: REDUCED_HOLD.cast,
        cues: castCues(look, e.spell),
        look,
        actKind: "cast",
      };
    }
    case "ability":
      return {
        base: DURATIONS.ability,
        reducedBase: REDUCED_HOLD.text,
        cues: [
          e.ability === "siren-song" ? "battle.siren-song" : "battle.ability",
        ],
        actKind: "ability",
      };
    case "schedule":
      // The deck gun booms as it fires; its harm follows at once.
      return {
        base: 0,
        reducedBase: 0,
        cues:
          e.change === "fired" && e.event.effect.id === DECK_GUN_EFFECT
            ? ["battle.deck-gun"]
            : [],
      };
    default:
      return { base: 0, reducedBase: 0, cues: [] };
  }
}

/**
 * Events in index order. A batch may hold several engine steps (each
 * numbered from 0): a new step starts at each index 0 after the first
 * event, and the steps keep their order.
 */
export function orderEvents(events: readonly BattleEvent[]): BattleEvent[] {
  const steps: BattleEvent[][] = [];
  for (const e of events) {
    const last = steps[steps.length - 1];
    if (last === undefined || (e.index === 0 && last.length > 0))
      steps.push([e]);
    else last.push(e);
  }
  return steps.flatMap((s) => s.slice().sort((a, b) => a.index - b.index));
}

/** Plans one batch of events (see the module comment). */
export function planBatch(
  events: readonly BattleEvent[],
  before: BattleState,
  options: PlanOptions,
): Beat[] {
  const instant = !(options.speed < Infinity) || options.speed <= 0;
  let prev: BattleEvent | null = null;
  return orderEvents(events).map((event, order) => {
    const d = describe(event, before);
    // A run of ground features from one rule (a wall of fire, a mist)
    // spawns together: after the first, each adds only a short beat.
    if (
      event.type === "ground" &&
      event.change === "added" &&
      prev?.type === "ground" &&
      prev.change === "added"
    ) {
      d.base = Math.min(d.base, GROUND_FOLLOW);
      d.reducedBase = 0;
    }
    prev = event;
    const base = instant ? 0 : options.reduced ? d.reducedBase : d.base;
    const beat: Beat = {
      order,
      index: event.index,
      event,
      cues: instant ? [] : d.cues,
      base,
      ms: instant ? 0 : base / options.speed,
      decorate: !instant && !options.reduced,
      motion: !instant && !options.reduced,
      ...(d.look ? { look: d.look } : {}),
      ...(d.actKind ? { actKind: d.actKind } : {}),
    };
    return beat;
  });
}

/** Total time a batch takes at speed 1 with full motion. */
export function batchDuration(
  events: readonly BattleEvent[],
  before?: BattleState,
): number {
  const state = before ?? ({ stacks: [] } as unknown as BattleState);
  return planBatch(events, state, { speed: 1, reduced: false }).reduce(
    (t, b) => t + b.base,
    0,
  );
}
