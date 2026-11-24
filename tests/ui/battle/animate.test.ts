import { describe, expect, it } from "vitest";
import { applyAction, chooseAiAction } from "../../../src/core/battle/index.ts";
import type { BattleEvent } from "../../../src/core/battle/index.ts";
import {
  DURATIONS,
  SPEEDS,
  batchDuration,
  hopDuration,
  nextSpeed,
  speedLabel,
} from "../../../src/ui/battle/animate.ts";
import { at, battle, unit } from "./helpers.ts";

describe("animation timing", () => {
  it("every single animation stays under 400 ms at normal speed", () => {
    for (let n = 1; n <= 15; n++) {
      expect(hopDuration(n) * n).toBeLessThan(400);
      expect(hopDuration(n)).toBeLessThanOrEqual(DURATIONS.hopMax);
    }
    const meta = { index: 0, cause: null, rule: "engine" } as const;
    const singles: BattleEvent[] = [
      { ...meta, type: "attack", stackId: "a0", targetId: "d0" },
      { ...meta, type: "shoot", stackId: "a0", targetId: "d0" },
      { ...meta, type: "death", stackId: "d0" },
      { ...meta, type: "wait", stackId: "a0" },
      { ...meta, type: "roundStart", round: 2 },
    ];
    for (const e of singles) expect(batchDuration([e])).toBeLessThan(400);
  });

  it("times a real batch from the engine", () => {
    const s = battle(
      [unit("raptor", 7, at(2, 5))],
      [unit("orc-brute", 19, at(7, 5))],
    );
    const step = applyAction(s, chooseAiAction(s));
    expect(step.events.length).toBeGreaterThan(0);
    expect(batchDuration(step.events)).toBeGreaterThan(0);
  });

  it("cycles speeds 1, 2, 4, instant", () => {
    expect(SPEEDS.map(speedLabel)).toEqual([
      "Speed ×1",
      "Speed ×2",
      "Speed ×4",
      "Instant",
    ]);
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(Infinity)).toBe(1);
  });
});
