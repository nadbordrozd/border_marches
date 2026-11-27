/**
 * The battle status line (src/ui/battle/status.ts, bead UI2-05): one
 * sentence per (mode, hovered hex, chosen act) saying what a click does.
 * And the action bar's short labels, which never truncate.
 */

import { describe, expect, it } from "vitest";
import {
  actIds,
  act as actDef,
  createBattle,
  getStack,
  legalActions,
  previewAttack,
} from "../../../src/core/battle/index.ts";
import type { BattleState } from "../../../src/core/battle/index.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import { hexToStage } from "../../../src/render/battle/geometry.ts";
import {
  LABEL_LINE,
  actionBar,
  labelLines,
  shortLabel,
} from "../../../src/ui/battle/actions.ts";
import {
  hoverIntent,
  indexLegalActions,
} from "../../../src/ui/battle/intent.ts";
import type { HoverIntent } from "../../../src/ui/battle/intent.ts";
import type { CastPreview } from "../../../src/ui/battle/magic.ts";
import {
  decorateScenario,
  giveTurn,
  scenarioSetup,
} from "../../../src/ui/battle/scenarios.ts";
import { statusLine } from "../../../src/ui/battle/status.ts";
import type { ActStatus, StatusMode } from "../../../src/ui/battle/status.ts";
import { at, battle, unit } from "./helpers.ts";

const turn = (intent: HoverIntent, stepAfter = 0): StatusMode => ({
  kind: "turn",
  intent,
  swaps: false,
  stepAfter,
});

/** Raptors next to Orc Brutes; a Spitter further back. */
function field(): BattleState {
  return battle(
    [unit("raptor", 7, at(6, 5)), unit("spitter", 10, at(2, 2))],
    [unit("orc-brute", 19, at(7, 5))],
  );
}

const NETTLE: ActStatus = {
  name: "Nettle",
  verb: "Cast",
  prompt: "Choose an enemy stack.",
  pickIn: "field",
  valid: 2,
  noTarget: null,
  hover: { kind: "none" },
};

const HIT: CastPreview = {
  legal: true,
  message: null,
  lines: [],
  summary: ["Goblins: −42 HP, 3 killed, +Venomed"],
};

describe("statusLine", () => {
  it("move: where the click walks", () => {
    const s = field();
    const line = statusLine(
      s,
      turn({
        kind: "move",
        action: { type: "move", stackId: "a0", to: at(4, 5) },
        path: [at(5, 5), at(4, 5)],
      }),
    );
    expect(line).toEqual({ text: "Move here (2 hexes)", tone: "go" });
  });

  it("melee: damage, kills and the strike back", () => {
    const s = field();
    const action = {
      type: "attack",
      stackId: "a0",
      targetId: "d0",
      from: at(6, 5),
    } as const;
    const line = statusLine(
      s,
      turn({
        kind: "attack",
        action,
        preview: previewAttack(s, action),
        path: [],
      }),
    );
    expect(line.tone).toBe("attack");
    expect(line.text).toBe(
      "Attack Orc Brutes: 42 damage, 1 killed · they strike back: 118 damage, 5 killed",
    );
    // Hit and Run says a step follows.
    const run = statusLine(
      s,
      turn(
        { kind: "attack", action, preview: previewAttack(s, action), path: [] },
        2,
      ),
    );
    expect(run.text).toMatch(/ · then choose where to step$/);
  });

  it("shoot: no retaliation, and the condition it leaves", () => {
    const s = { ...field(), activeStackId: "a1" };
    const action = { type: "shoot", stackId: "a1", targetId: "d0" } as const;
    const line = statusLine(
      s,
      turn({
        kind: "attack",
        action,
        preview: previewAttack(s, action),
        path: [],
      }),
    );
    expect(line.text).toMatch(/^Shoot Orc Brutes: \d+ damage, /);
    expect(line.text).toContain(" · Shots are never retaliated");
    expect(line.text).toContain(" · Venomed on Orc Brutes (−3 Def, 2 rounds)");
  });

  it("swap: places traded with a Sworn partner", () => {
    const sc = scenarioSetup("realm", 3);
    if (!sc) throw new Error("no scenario");
    const s = giveTurn(
      decorateScenario("realm", createBattle(sc.engine).state),
      "a0",
    );
    const legal = indexLegalActions(legalActions(s));
    const partner = getStack(s, "a1");
    const it = hoverIntent(
      s,
      legal,
      partner.hex,
      hexToStage(partner.hex),
      true,
    );
    expect(it.kind).toBe("swap");
    expect(statusLine(s, turn(it))).toEqual({
      text: "Swap places with the Longbowmen (in place of the walk; ends the turn)",
      tone: "go",
    });
  });

  it("idle turn, out of reach and inspect", () => {
    const s = field();
    expect(statusLine(s, turn({ kind: "none" })).text).toBe(
      "Raptors ×7: click a shaded hex to move or an enemy to attack",
    );
    expect(
      statusLine(s, { ...turn({ kind: "none" }), swaps: true } as StatusMode)
        .text,
    ).toMatch(/, or a ⇄ partner to swap$/);
    // A stack that cannot walk (its Afters turn, bzc.117) is told so.
    const afters: BattleState = {
      ...s,
      stacks: s.stacks.map((x) =>
        x.id === s.activeStackId ? { ...x, aftersRound: s.round } : x,
      ),
    };
    expect(statusLine(afters, turn({ kind: "none" })).text).toBe(
      "Raptors ×7: Afters, no walking; click an enemy to attack",
    );
    expect(
      statusLine(s, turn({ kind: "out-of-reach", stack: getStack(s, "d0") })),
    ).toEqual({ text: "Orc Brutes ×19: out of reach this turn", tone: "warn" });
    expect(
      statusLine(s, turn({ kind: "inspect", stack: getStack(s, "a1") })).text,
    ).toBe("Spitters ×10 · right-click for details");
  });

  it("cast, choosing a target: the prompt with the spell's name", () => {
    expect(statusLine(field(), { kind: "act", act: NETTLE })).toEqual({
      text: "Choose an enemy stack for Nettle (Esc to cancel)",
      tone: "idle",
    });
    // A prompt with more steps keeps its words after the name.
    const two = statusLine(field(), {
      kind: "act",
      act: { ...NETTLE, prompt: "Choose a stack, then one of its conditions." },
    });
    expect(two.text).toBe(
      "Nettle: choose a stack, then one of its conditions (Esc to cancel)",
    );
    // A pick made in the side panel says so.
    const panel = statusLine(field(), {
      kind: "act",
      act: { ...NETTLE, prompt: "Choose +2 or −2", pickIn: "panel" },
    });
    expect(panel.text).toBe(
      "Choose +2 or −2 for Nettle in the panel (Esc to cancel)",
    );
  });

  it("cast, pointing at a target: what the click casts and does", () => {
    const on = statusLine(field(), {
      kind: "act",
      act: {
        ...NETTLE,
        hover: { kind: "target", what: "the Goblins", preview: HIT },
      },
    });
    expect(on).toEqual({
      text: "Cast Nettle on the Goblins · Goblins: −42 HP, 3 killed, +Venomed",
      tone: "go",
    });
    const first = statusLine(field(), {
      kind: "act",
      act: {
        ...NETTLE,
        name: "Change Places",
        hover: { kind: "target", what: "the Goblins", preview: null },
      },
    });
    expect(first.text).toBe(
      "Pick the Goblins for Change Places, then the next target",
    );
    const none = statusLine(field(), {
      kind: "act",
      act: {
        ...NETTLE,
        hover: {
          kind: "no-effect",
          what: "the Goblins",
          reason: "They are already Venomed",
        },
      },
    });
    expect(none).toEqual({
      text: "No effect on the Goblins: They are already Venomed",
      tone: "warn",
    });
  });

  it("cast confirm: every target chosen, Enter casts", () => {
    expect(
      statusLine(field(), {
        kind: "act",
        act: { ...NETTLE, prompt: null, valid: null },
      }),
    ).toEqual({
      text: "Enter: cast Nettle (Backspace goes back, Esc cancels)",
      tone: "go",
    });
    expect(
      statusLine(field(), {
        kind: "act",
        act: { ...NETTLE, verb: "Use", name: "Tinderbox", prompt: null },
      }).text,
    ).toBe("Enter: use Tinderbox (Backspace goes back, Esc cancels)");
  });

  it("no target: the reason instead of a prompt", () => {
    expect(
      statusLine(field(), {
        kind: "act",
        act: { ...NETTLE, valid: 0, noTarget: "No enemy stack to aim at" },
      }),
    ).toEqual({
      text: "Nettle has nothing to aim at: No enemy stack to aim at (Esc to cancel)",
      tone: "warn",
    });
  });

  it("enemy turn, auto-combat, animation and the end", () => {
    const s = { ...field(), activeStackId: "d0" };
    expect(statusLine(s, { kind: "enemy" })).toEqual({
      text: "Enemy turn: Orc Brutes ×19",
      tone: "enemy",
    });
    expect(statusLine(field(), { kind: "auto" }).text).toBe(
      "Auto-combat plays your side: Raptors ×7 (A takes over)",
    );
    expect(statusLine(field(), { kind: "busy" }).text).toMatch(/Space skips/);
    expect(statusLine(field(), { kind: "over" }).text).toBe(
      "The battle is over.",
    );
  });

  it("Hit and Run: the step after the attack", () => {
    expect(statusLine(field(), { kind: "after", hexes: 2 })).toEqual({
      text: "Attack, then step here (2 hexes)",
      tone: "attack",
    });
    expect(statusLine(field(), { kind: "after", hexes: null }).text).toMatch(
      /^Click a green hex/,
    );
  });
});

describe("action bar labels (UI2-05)", () => {
  it("drop a leading article and fit two short lines", () => {
    expect(shortLabel("A Pinch of Sand")).toBe("Pinch of Sand");
    expect(shortLabel("The Bellhop's Cap")).toBe("Bellhop's Cap");
    expect(shortLabel("Swear In")).toBe("Swear In");
    expect(labelLines("Pinch of Sand")).toEqual(["Pinch of", "Sand"]);
    expect(labelLines("Cider Flask")).toEqual(["Cider Flask"]);
  });

  it("every act's label wraps to at most two lines, none cut", () => {
    registerSpells();
    for (const id of actIds()) {
      const name = actDef(id).name;
      const lines = labelLines(shortLabel(name));
      expect(lines.length, name).toBeLessThanOrEqual(2);
      for (const l of lines)
        expect(l.length, `${name}: ${l}`).toBeLessThanOrEqual(LABEL_LINE);
    }
  });

  it("every bar action carries its short label", () => {
    const s = field();
    const bar = actionBar(s, {
      playerTurn: true,
      canUndo: false,
      heartenSpend: true,
    });
    for (const a of bar) expect(a.short, a.key).toBeTruthy();
    expect(bar.find((a) => a.key === "wait")?.short).toBe("Wait");
  });
});
