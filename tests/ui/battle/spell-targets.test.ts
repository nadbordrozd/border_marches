/**
 * Spell targeting (bead bzc.47, src/ui/battle/spell-targets.ts): the
 * target type of each spell in plain words, every valid target of the next
 * step as the engine judges it, and pages greyed with a reason when
 * nothing on the field can take them.
 */

import { describe, expect, it } from "vitest";
import { actionError } from "../../../src/core/battle/index.ts";
import type { ActTarget } from "../../../src/core/battle/index.ts";
import { BATTLE_SPELLS } from "../../../src/core/magic/index.ts";
import { castAction, heroBook } from "../../../src/ui/battle/magic.ts";
import type { BookEntry } from "../../../src/ui/battle/magic.ts";
import {
  castChoices,
  castHasTarget,
  choiceStacks,
  effectiveChoices,
  noEffectReason,
  spellTargetKind,
  targetKind,
  withTargetStatus,
} from "../../../src/ui/battle/spell-targets.ts";
import { H, S, battle, withConditions } from "../../core/magic/helpers.ts";

const page = (id: string) => ({ id, source: "page" as const });

const field = (magic = {}) =>
  battle({
    mine: [{ hex: { col: 1, row: 5 } }, { hex: { col: 1, row: 7 } }],
    theirs: [{ hex: { col: 8, row: 5 } }, { hex: { col: 8, row: 8 } }],
    magic,
  });

const stacksOf = (list: readonly { target: ActTarget }[]) =>
  list.map((c) => ("stack" in c.target ? c.target.stack : null));

const entryOf = (book: readonly BookEntry[], id: string) =>
  book.find((e) => e.id === id);

describe("the target type of a spell", () => {
  it("names every rule in plain words with an icon", () => {
    expect(spellTargetKind("sign-here")).toEqual({
      icon: "enemy",
      label: "An enemy stack",
    });
    expect(spellTargetKind("take-heart")?.icon).toBe("friendly");
    expect(spellTargetKind("jolt")?.icon).toBe("stack");
    expect(spellTargetKind("broadside")).toEqual({
      icon: "area",
      label: "Area: a hex and the 6 around it",
    });
    expect(spellTargetKind("orchard-day")?.icon).toBe("all");
    expect(spellTargetKind("encore")?.icon).toBe("self");
    expect(spellTargetKind("tinderbox")).toBeNull();
    for (const s of BATTLE_SPELLS)
      expect(targetKind(s.target).label.length).toBeGreaterThan(5);
  });
});

describe("valid targets of the next step", () => {
  it("lists only enemy stacks for an enemy spell, friends for a friendly one", () => {
    const s = field();
    expect(stacksOf(castChoices(s, page("sign-here"), []))).toEqual([
      "d0",
      "d1",
    ]);
    expect(stacksOf(castChoices(s, page("take-heart"), []))).toEqual([
      "a0",
      "a1",
    ]);
    expect(stacksOf(castChoices(s, page("jolt"), []))).toHaveLength(4);
    // Every choice is legal by the engine.
    for (const c of castChoices(s, page("sign-here"), []))
      expect(
        actionError(s, castAction(s, page("sign-here"), [c.target])),
      ).toBeNull();
  });

  it("offers a condition only where the spell can take it", () => {
    const s0 = field();
    expect(castChoices(s0, page("feed"), [])).toEqual([]);
    const s1 = withConditions(s0, "d0", [
      { kind: "venomed", size: 2, clock: 2 },
    ]);
    const choices = castChoices(s1, page("feed"), []);
    expect(choices).toHaveLength(1);
    expect(choices[0]?.hex).toEqual({ col: 8, row: 5 });
    expect(choiceStacks(s1, choices)).toEqual(["d0"]);
  });

  it("passes a bane only to a stack beside its bearer", () => {
    const bane = { kind: "venomed", size: 2, clock: 2 };
    const apart = withConditions(field(), "d0", [bane]);
    expect(castHasTarget(apart, page("pass-on"))).toBe(false);
    const close = withConditions(
      battle({
        mine: [{ hex: { col: 1, row: 5 } }],
        theirs: [{ hex: { col: 8, row: 5 } }, { hex: { col: 9, row: 5 } }],
      }),
      "d0",
      [bane],
    );
    const first = castChoices(close, page("pass-on"), []);
    expect(first).toHaveLength(1);
    const next = castChoices(close, page("pass-on"), [
      first[0]?.target as ActTarget,
    ]);
    expect(stacksOf(next)).toEqual(["d1"]);
  });

  it("aims a line: the second hex beside the first, then the one that follows", () => {
    const s = field();
    const second = castChoices(s, page("bramble-row"), [H(4, 4)]);
    expect(second.length).toBeGreaterThan(0);
    expect(second.length).toBeLessThanOrEqual(6);
    const third = castChoices(s, page("bramble-row"), [H(4, 4), H(5, 4)]);
    expect(third.map((c) => c.hex)).toEqual([{ col: 6, row: 4 }]);
  });

  it("pushes with one pick: Gust needs no second hex", () => {
    expect(castChoices(field(), page("gust"), [S("d0")])).toEqual([]);
  });

  it("shares in one step: only conditions on a linked stack, never the link", () => {
    let s = withConditions(field(), "a0", [
      { kind: "scapegoat", link: "a1", clock: 3 },
      { kind: "shielded", size: 2, clock: 3 },
    ]);
    s = withConditions(s, "d0", [{ kind: "venomed", size: 1, clock: 2 }]);
    const choices = castChoices(s, page("share"), []);
    expect(
      choices.map((c) => ("condition" in c.target ? c.target.condition : 0)),
    ).toEqual([
      s.stacks[0]?.conditions.find((c) => c.kind === "shielded")?.uid,
    ]);
    expect(castHasTarget(field(), page("share"))).toBe(false);
  });

  it("is empty once every target is chosen", () => {
    expect(castChoices(field(), page("jolt"), [S("d0")])).toEqual([]);
  });
});

describe("pages with nothing to aim at", () => {
  it("are greyed with a one-line reason; other states keep theirs", () => {
    const s = field({
      pages: ["feed", "second-shift", "jolt", "deadline"],
      mana: 10,
    });
    const book = withTargetStatus(s, heroBook(s, "attacker"));
    expect(entryOf(book, "feed")).toMatchObject({
      status: "target",
      reason: "No condition on the field it can take",
    });
    expect(entryOf(book, "second-shift")).toMatchObject({
      status: "target",
      reason: "No remains of your stacks on the field",
    });
    expect(entryOf(book, "jolt")).toMatchObject({
      status: "ready",
      reason: null,
    });
    expect(entryOf(book, "deadline")).toMatchObject({
      status: "mana",
      reason: "Needs 14 mana (10 left)",
    });
  });

  it("checks the whole book quickly", () => {
    const s = field();
    const t0 = performance.now();
    const book = withTargetStatus(s, heroBook(s, "attacker"));
    expect(book.length).toBeGreaterThan(40);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("targets that would change nothing", () => {
  const gated = (count0: number, count1: number) =>
    battle({
      mine: [{ hex: { col: 1, row: 5 } }],
      theirs: [
        { hex: { col: 8, row: 5 }, count: count0 },
        { hex: { col: 8, row: 8 }, count: count1 },
      ],
      magic: { pages: ["sign-here", "regrow", "jolt"] },
    });

  it("are legal but marked with the refusal, and do not count as effective", () => {
    // Pikemen of 10 HP: 5 are under Sign Here's gate, 40 above it.
    const s = gated(5, 40);
    const choices = castChoices(s, page("sign-here"), []);
    expect(stacksOf(choices)).toEqual(["d0", "d1"]);
    expect(choices[0]?.noEffect).toBeNull();
    expect(choices[1]?.noEffect).toMatch(/^Turned refused by .*gate \d+ HP/);
    expect(stacksOf(effectiveChoices(choices))).toEqual(["d0"]);
  });

  it("grey the page when every legal target would change nothing", () => {
    const s = gated(40, 40);
    expect(castHasTarget(s, page("sign-here"))).toBe(true);
    const book = withTargetStatus(s, heroBook(s, "attacker"));
    expect(entryOf(book, "sign-here")).toMatchObject({ status: "target" });
    expect(entryOf(book, "sign-here")?.reason).toMatch(
      /^Would have no effect: every enemy is above the \d+ HP gate$/,
    );
    // Nobody is wounded: a heal changes nothing.
    expect(entryOf(book, "regrow")).toMatchObject({
      status: "target",
      reason: "Would have no effect: nothing on the field would change",
    });
    expect(entryOf(book, "jolt")?.status).toBe("ready");
  });

  it("explains gates, immunity and empty casts in short words", () => {
    expect(noEffectReason("enemy", [])).toBe(
      "nothing on the field would change",
    );
  });
});
