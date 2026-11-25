import { describe, expect, it } from "vitest";
import {
  createBattle,
  enemyIntents,
  getStack,
  makeCondition,
  rehearse,
} from "../../../src/core/battle/index.ts";
import type { BattleState, Hex } from "../../../src/core/battle/index.ts";
import {
  SCHOOL_COLORS,
  chainLines,
  conditionPips,
  conditionTooltip,
  groundMarks,
  intentMarkers,
  linkLines,
  timelineEntries,
} from "../../../src/ui/battle/grammar.ts";
import "../../core/battle/content.ts";
import { OGRE, TROLL, TRICERATOPS } from "../../core/battle/fixtures.ts";
import { patchStack, withFx } from "../../core/battle/helpers.ts";

const at = (col: number, row: number): Hex => ({ col, row });

function board(): BattleState {
  return createBattle({
    seed: 1,
    obstacles: [at(5, 1)],
    ground: [{ hex: at(9, 9), kind: "fire", size: 5 }],
    attacker: {
      hero: { attack: 0, defense: 0 },
      stacks: [
        { creature: TRICERATOPS, count: 3, hex: at(6, 5) },
        { creature: OGRE, count: 8, hex: at(1, 1) },
      ],
    },
    defender: {
      hero: null,
      stacks: [{ creature: TROLL, count: 30, hex: at(7, 5) }],
    },
  }).state;
}

describe("battle grammar view", () => {
  it("condition pips use the school colour; tooltips give school, clock, gate", () => {
    const s = patchStack(board(), "d0", {
      conditions: [
        makeCondition(
          { kind: "frozen", clock: 2, gate: { measure: "hp", max: 300 } },
          900,
          "x",
        ),
      ],
    });
    expect(conditionPips(s, "d0")).toEqual([
      expect.objectContaining({
        kind: "frozen",
        color: SCHOOL_COLORS.storm,
        bane: true,
        hold: true,
        linked: false,
      }),
    ]);
    expect(conditionTooltip(s, getStack(s, "d0").conditions[0]!)).toBe(
      "Frozen (Storm bane, Hold, 2 rounds left, gate 300 HP): Hold: cannot act or retaliate for 2 rounds. The first Strike against it is x 200% and ends Frozen.",
    );
  });

  it("links and non-blocking ground are listed for drawing", () => {
    const s = withFx(board(), (fx) =>
      fx.link("a0", "a1", { kind: "scapegoat" }),
    ).state;
    expect(linkLines(s)).toEqual([
      {
        near: "a0",
        far: "a1",
        color: SCHOOL_COLORS.accord,
        label: "Scapegoat",
      },
    ]);
    expect(groundMarks(s)).toEqual([
      { hex: at(9, 9), kind: "fire", color: SCHOOL_COLORS.storm, glyph: "F" },
    ]);
  });

  it("the chain reads one line per step", () => {
    const s = withFx(board(), (fx) =>
      fx.link("a0", "a1", { kind: "scapegoat" }),
    ).state;
    const r = rehearse(s, {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    });
    const lines = chainLines(s, r.steps);
    expect(lines[0]).toMatch(/^Triceratops strike Trolls \d+/);
    expect(lines[1]).toMatch(
      /^Trolls retaliate on Triceratops \d+ → link → Ogres$/,
    );
    expect(lines[2]).toMatch(/^link carries \d+ to Ogres$/);
    expect(lines[3]).toMatch(/^Ogres take \d+ Harm/);
  });

  it("the timeline lists stacks in acting order and scheduled events", () => {
    const s = withFx(board(), (fx) => {
      fx.delay("a1", 2);
      fx.schedule({
        round: 2,
        phase: "start",
        effect: { id: "harm" },
        side: "attacker",
      });
    }).state;
    const t = timelineEntries(s);
    expect(t.map((e) => e.id)).toEqual([
      "a0",
      "d0",
      "a1",
      expect.stringMatching(/^e\d+$/),
    ]);
    expect(t[2]).toMatchObject({ note: "Delayed" });
  });

  it("intent markers name the target and the rehearsed damage", () => {
    const s = board();
    const marks = intentMarkers(s, enemyIntents(s, "attacker"));
    expect(marks).toHaveLength(1);
    expect(marks[0]!.stackId).toBe("d0");
    expect(marks[0]!.text).toMatch(/^attack → (Triceratops|Ogres) \d+$/);
  });
});
