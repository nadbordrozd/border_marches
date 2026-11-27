/**
 * The Deepforge on the battle screen (bead bzc.135, FACTION_DWARVES 3 and
 * 5): a lobbed shell on its hex and on the round boundary of the timeline,
 * the Steam badge's size, and what D does for a stack that Stokes.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  canWait,
  getStack,
  neighbors,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleState,
} from "../../../src/core/battle/index.ts";
import {
  badgeRow,
  conditionPips,
  shellMarks,
} from "../../../src/render/battle/grammar-view.ts";
import { actionBar } from "../../../src/ui/battle/actions.ts";
import type { BarContext } from "../../../src/ui/battle/actions.ts";
import { shellLines } from "../../../src/ui/battle/condition-card.ts";
import { timelineEntries } from "../../../src/ui/battle/grammar.ts";
import { turnQueue } from "../../../src/ui/battle/queue.ts";
import type { QueueEntry } from "../../../src/ui/battle/queue.ts";
import { statusLine } from "../../../src/ui/battle/status.ts";
import type { StatusMode } from "../../../src/ui/battle/status.ts";
import { at, battle, unit } from "../../core/battle/faction-helpers.ts";

const T = at(10, 5);

function play(s: BattleState, a: BattleAction): BattleState {
  return applyAction(s, a).state;
}

/** Plays the other stacks (Wait, else Defend) until `id` is active. */
function until(s: BattleState, id: string): BattleState {
  let cur = s;
  for (let i = 0; i < 40 && cur.activeStackId !== id; i++) {
    const a = cur.activeStackId as string;
    const type = canWait(getStack(cur, a)) ? "wait" : "defend";
    cur = play(cur, { type, stackId: a });
  }
  expect(cur.activeStackId).toBe(id);
  return cur;
}

/** Mortars at (1, 5) lob a shell at Steam Tanks on T. */
function lobbed(): BattleState {
  const s = battle(
    { stacks: [unit("mortar", 4, at(1, 5))] },
    { stacks: [unit("steam-tank", 2, T), unit("orc-brute", 6, at(12, 1))] },
  );
  return play(until(s, "a0"), { type: "shootHex", stackId: "a0", at: T });
}

function short(q: readonly QueueEntry[]): string[] {
  return q.map((e) =>
    e.kind === "divider"
      ? `|${e.round}`
      : e.kind === "event"
        ? e.shell
          ? `shell@${e.shell.hex.col},${e.shell.hex.row}`
          : "event"
        : e.key,
  );
}

const turn = (intent: { kind: "none" }): StatusMode => ({
  kind: "turn",
  intent,
  swaps: false,
  stepAfter: 0,
});

const ctx: BarContext = {
  playerTurn: true,
  canUndo: false,
  heartenSpend: true,
};

describe("a shell in the air (Lob)", () => {
  it("is marked on its hex with its splash", () => {
    const s = lobbed();
    expect(shellMarks(s)).toEqual([
      { hex: T, splash: neighbors(T), round: 2, stackId: "a0" },
    ]);
  });

  it("sits on the round boundary of the timeline, after the divider", () => {
    const s = lobbed();
    const shell = timelineEntries(s).find((e) => e.shell !== undefined);
    expect(shell).toMatchObject({
      kind: "event",
      label: "Mortars' shell",
      side: "attacker",
      shell: { hex: T, round: 2, stackId: "a0" },
    });
    const q = short(turnQueue(s));
    const div = q.indexOf("|2");
    expect(div).toBeGreaterThan(0);
    expect(q[div + 1]).toBe("shell@10,5");
    // Nothing of this round comes after the divider but the shell.
    expect(q.slice(0, div).some((x) => x.startsWith("shell"))).toBe(false);
    // However long the round, the shell keeps its tile (one is left for
    // the active stack).
    const two = short(turnQueue(s, 2));
    expect(two[1]).toBe("|2");
    expect(two[2]).toBe("shell@10,5");
    expect(two).toHaveLength(3);
    // A finished battle shows no shell.
    const over = turnQueue({ ...s, winner: "attacker" as const });
    expect(over.some((e) => e.kind === "event" && e.shell)).toBe(false);
  });

  it("tells the stacks on the hex and next to it what lands", () => {
    const s = lobbed();
    expect(shellLines(s, T)).toEqual([
      "Shell: the Mortars' shell lands here at the start of round 2, a shot on whatever stands here, friend or foe.",
    ]);
    expect(shellLines(s, neighbors(T)[0]!)[0]).toMatch(/^Splash: /);
    expect(shellLines(s, at(1, 1))).toEqual([]);
  });
});

describe("Steam and Stoke on the screen", () => {
  const stoked = (): BattleState =>
    battle(
      {
        birthright: "stoke",
        stacks: [unit("steam-tank", 2, at(3, 5), { native: true })],
      },
      { stacks: [unit("orc-brute", 6, at(12, 5))] },
    );

  it("the Steam badge carries its size; other badges do not", () => {
    let s = until(stoked(), "a0");
    s = play(s, { type: "defend", stackId: "a0" });
    const pips = conditionPips(s, "a0");
    const steam = badgeRow(pips).shown.find((p) => p.kind === "steam");
    expect(steam?.size).toBe(1);
    expect(conditionPips(s, "d0").every((p) => p.size === undefined)).toBe(
      true,
    );
  });

  it("the status line and the Defend button say what D does", () => {
    const s = until(stoked(), "a0");
    expect(statusLine(s, turn({ kind: "none" })).text).toBe(
      "Steam Tanks ×2: click a shaded hex to move or an enemy to attack; D stokes: Steam 1",
    );
    const bar = actionBar(s, ctx).find((a) => a.key === "defend");
    expect(bar).toMatchObject({ label: "Stoke", hotkey: "D" });
    expect(bar?.rule).toMatch(/Steam 1 \(at most 3\).*x150%/);
    // An enemy that does not stoke keeps the plain Defend.
    const plain = until(play(s, { type: "defend", stackId: "a0" }), "d0");
    const d = actionBar(plain, ctx).find((a) => a.key === "defend");
    expect(d?.label).toBe("Defend");
    expect(statusLine(plain, turn({ kind: "none" })).text).not.toMatch(
      /stokes/,
    );
  });
});
