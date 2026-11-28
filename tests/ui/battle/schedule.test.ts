import { describe, expect, it } from "vitest";
import {
  DECK_GUN_EFFECT,
  applyAction,
  chooseAiAction,
  createBattle,
  legalActions,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleEvent,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import { onFxEvent } from "../../../src/audio/fx.ts";
import type { FxEvent } from "../../../src/audio/fx.ts";
import { createScene } from "../../../src/render/battle/scene.ts";
import { Animator } from "../../../src/ui/battle/animate.ts";
import {
  DURATIONS,
  REDUCED_HOLD,
  orderEvents,
  planBatch,
} from "../../../src/ui/battle/schedule.ts";
import { at, battle, unit } from "./helpers.ts";

registerSpells();

const meta = (index: number) =>
  ({ index, cause: null, rule: "engine" }) as const;

function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

/** A melee exchange from the engine: move, attack, damage, retaliation... */
function meleeStep(): {
  before: BattleState;
  events: readonly BattleEvent[];
  after: BattleState;
  action: BattleAction;
} {
  const before = battle(
    [unit("raptor", 7, at(4, 5))],
    [unit("orc-brute", 19, at(7, 5))],
  );
  const id = before.activeStackId ?? "a0";
  const action =
    legalActions(before).find((a) => a.type === "attack" && a.stackId === id) ??
    chooseAiAction(before);
  const step = applyAction(before, action);
  return { before, events: step.events, after: step.state, action };
}

/** A hero cast of Jolt on the enemy stack. */
function castStep(): {
  before: BattleState;
  events: readonly BattleEvent[];
  after: BattleState;
  action: BattleAction;
} {
  const before = createBattle({
    seed: 1,
    obstacles: [],
    attacker: {
      hero: { attack: 2, defense: 2 },
      magic: { power: 2, mana: 40, schoolRanks: { storm: 1 }, pages: ["jolt"] },
      stacks: [unit("raptor", 7, at(2, 5))],
    },
    defender: { hero: null, stacks: [unit("orc-brute", 19, at(7, 5))] },
  }).state;
  const actor = before.stacks.find((x) => x.side === "attacker")?.id ?? "a0";
  const target = before.stacks.find((x) => x.side === "defender")?.id ?? "d0";
  const action: BattleAction = {
    type: "heroAct",
    stackId: actor,
    act: "jolt",
    targets: [{ stack: target }],
  };
  // The hero acts on its own side's turn.
  let state = before;
  for (let i = 0; i < 4 && state.activeStackId !== actor; i++)
    state = applyAction(state, chooseAiAction(state)).state;
  const step = applyAction(state, action);
  return { before: state, events: step.events, after: step.state, action };
}

/** Plays a batch on a manual clock until it ends. */
async function playManually(
  animator: Animator,
  scene: ReturnType<typeof createScene>,
  run: () => Promise<void>,
): Promise<number> {
  let done = false;
  const p = run().then(() => {
    done = true;
  });
  let t = 0;
  while (!done && t < 20000) {
    t += 16;
    scene.now = t;
    animator.tick(t);
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }
  await p;
  return t;
}

describe("animation scheduler", () => {
  it("orders beats by event index within each engine step", () => {
    const ev = (i: number): BattleEvent => ({
      ...meta(i),
      type: "wait",
      stackId: `a${i}`,
    });
    const shuffled = [ev(0), ev(3), ev(1), ev(2)];
    expect(orderEvents(shuffled).map((e) => e.index)).toEqual([0, 1, 2, 3]);
    // Two steps (each numbered from 0) keep their order.
    const two = [ev(0), ev(2), ev(1), ev(0), ev(1)];
    expect(orderEvents(two).map((e) => e.index)).toEqual([0, 1, 2, 0, 1]);
    const { before, events } = meleeStep();
    const beats = planBatch(events, before, { speed: 1, reduced: false });
    expect(beats.map((b) => b.index)).toEqual(events.map((e) => e.index));
    expect(beats.map((b) => b.order)).toEqual(beats.map((_, i) => i));
  });

  it("cues the deck gun, Siren Song and Tidal Wave (NAVAL 11)", () => {
    const { before } = meleeStep();
    const fired = (id: string): BattleEvent => ({
      ...meta(0),
      type: "schedule",
      change: "fired",
      event: {
        id: 1,
        round: 2,
        phase: "start",
        side: "attacker",
        source: id,
        effect: { id, args: { harm: 40 } },
      },
    });
    const cuesOf = (e: BattleEvent) =>
      planBatch([e], before, { speed: 1, reduced: false })[0]?.cues;
    expect(cuesOf(fired(DECK_GUN_EFFECT))).toEqual(["battle.deck-gun"]);
    expect(cuesOf(fired("engine:get-up"))).toEqual([]);
    expect(
      cuesOf({
        ...meta(0),
        type: "ability",
        stackId: "d0",
        ability: "siren-song",
      }),
    ).toEqual(["battle.siren-song"]);
    expect(
      cuesOf({
        ...meta(0),
        type: "heroAct",
        side: "attacker",
        act: "tidal-wave",
      }),
    ).toEqual(["spell.tidal-wave"]);
  });

  it("gives every beat its effect names and full timings", () => {
    const { before, events } = meleeStep();
    const beats = planBatch(events, before, { speed: 1, reduced: false });
    const attack = beats.find((b) => b.event.type === "attack");
    expect(attack?.cues).toContain("battle.lunge");
    expect(attack?.base).toBe(DURATIONS.lunge);
    const hit = beats.find((b) => b.event.type === "damage");
    expect(hit?.cues.some((c) => c.startsWith("battle.impact"))).toBe(true);
    for (const b of beats) {
      expect(b.decorate).toBe(true);
      expect(b.base).toBeLessThan(400);
    }
  });

  it("names each cast after its school, wired to the school sound", () => {
    const { before, events } = castStep();
    const beats = planBatch(events, before, { speed: 1, reduced: false });
    const cast = beats.find((b) => b.event.type === "heroAct");
    expect(cast?.cues).toEqual([
      "spell.cast.storm",
      "spell.bolt.storm",
      "spell.impact.storm",
    ]);
    expect(cast?.look).toMatchObject({ school: "storm", element: "lightning" });
  });

  it("divides the timings by the speed", () => {
    const { before, events } = meleeStep();
    const x1 = planBatch(events, before, { speed: 1, reduced: false });
    const x4 = planBatch(events, before, { speed: 4, reduced: false });
    x1.forEach((b, i) => expect(x4[i]?.ms).toBeCloseTo(b.ms / 4));
  });

  it("skips everything at instant speed", () => {
    const { before, events } = meleeStep();
    const beats = planBatch(events, before, {
      speed: Infinity,
      reduced: false,
    });
    for (const b of beats) {
      expect(b.ms).toBe(0);
      expect(b.cues).toEqual([]);
      expect(b.decorate).toBe(false);
      expect(b.motion).toBe(false);
    }
  });

  it("under reduced motion, holds only beats with news, with no tweens", () => {
    const { before, events } = meleeStep();
    const beats = planBatch(events, before, { speed: 1, reduced: true });
    for (const b of beats) {
      expect(b.decorate).toBe(false);
      expect(b.motion).toBe(false);
      if (b.event.type === "move" || b.event.type === "attack")
        expect(b.base).toBe(0);
      if (b.event.type === "damage") expect(b.base).toBe(REDUCED_HOLD.hit);
    }
    const full = planBatch(events, before, { speed: 1, reduced: false });
    const sum = (bs: typeof beats) => bs.reduce((t, b) => t + b.base, 0);
    expect(sum(beats)).toBeLessThan(sum(full));
  });

  it("shortens a run of ground features after the first", () => {
    const g = (i: number): BattleEvent => ({
      ...meta(i),
      type: "ground",
      change: "added",
      feature: {
        hex: { col: i, row: 3 },
        kind: "fire",
        class: "hazard",
        school: "storm",
        size: 10,
        clock: 3,
        remains: null,
        source: "test",
      },
    });
    const beats = planBatch([g(0), g(1), g(2)], battle([], []), {
      speed: 1,
      reduced: false,
    });
    expect(beats.map((b) => b.base)).toEqual([DURATIONS.ground, 30, 30]);
  });

  it("never changes the battle states (plan and playback)", async () => {
    for (const make of [meleeStep, castStep]) {
      const { before, events, after, action } = make();
      const snapshot = JSON.stringify([before, after]);
      deepFreeze(before);
      deepFreeze(after);
      for (const opts of [
        { speed: 1, reduced: false },
        { speed: 2, reduced: true },
        { speed: Infinity, reduced: false },
      ]) {
        planBatch(events, before, opts);
        const scene = createScene(before);
        const animator = new Animator(scene, {
          onTurn() {},
          onRound() {},
          onLog() {},
        });
        animator.speed = opts.speed as 1 | 2 | 4 | typeof Infinity;
        animator.reduced = opts.reduced;
        await playManually(animator, scene, () =>
          animator.play(events, before, after, action),
        );
        // The scene ends exactly on the after state.
        for (const s of after.stacks) {
          const u = scene.units.get(s.id);
          expect(u?.count).toBe(s.count);
        }
      }
      expect(JSON.stringify([before, after])).toBe(snapshot);
    }
  });

  it("raises effect names while playing, and none when instant or skipped", async () => {
    const { before, events, after, action } = castStep();
    const heard: FxEvent[] = [];
    const off = onFxEvent((n) => heard.push(n));
    const scene = createScene(before);
    const animator = new Animator(scene, {
      onTurn() {},
      onRound() {},
      onLog() {},
    });
    await playManually(animator, scene, () =>
      animator.play(events, before, after, action),
    );
    expect(heard).toContain("spell.cast.storm");
    expect(scene.fx.size).toBeGreaterThan(0);
    heard.length = 0;
    animator.speed = Infinity;
    await animator.play(events, before, after, action);
    expect(heard).toEqual([]);
    off();
  });

  it("draws no particles under reduced motion", async () => {
    const { before, events, after, action } = castStep();
    const scene = createScene(before);
    const animator = new Animator(scene, {
      onTurn() {},
      onRound() {},
      onLog() {},
    });
    animator.reduced = true;
    const t = await playManually(animator, scene, () =>
      animator.play(events, before, after, action),
    );
    expect(scene.fx.size).toBe(0);
    expect(t).toBeLessThan(1000);
  });
});
