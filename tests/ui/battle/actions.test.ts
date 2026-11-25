/**
 * The action bar's model (src/ui/battle/actions.ts): which actions the
 * active stack and its hero have, their hotkeys, icons, rule text, use
 * state and the reason each one is disabled.
 */

import { describe, expect, it } from "vitest";
import { getStack } from "../../../src/core/battle/index.ts";
import type { BattleState } from "../../../src/core/battle/index.ts";
import {
  actionBar,
  actionForKey,
  actionTooltip,
  shotBlocker,
} from "../../../src/ui/battle/actions.ts";
import type { BarAction, BarContext } from "../../../src/ui/battle/actions.ts";
import { giveTurn } from "../../../src/ui/battle/scenarios.ts";
import {
  at,
  battle,
  remains,
  unit,
} from "../../core/battle/faction-helpers.ts";

const HERO = { attack: 0, defense: 0 };
const MY_TURN: BarContext = {
  playerTurn: true,
  canUndo: false,
  heartenSpend: true,
};
const byKey = (bar: readonly BarAction[], key: string): BarAction => {
  const a = bar.find((x) => x.key === key);
  if (!a) throw new Error(`no ${key} in ${bar.map((x) => x.key).join(", ")}`);
  return a;
};
const patch = (
  s: BattleState,
  id: string,
  p: Partial<BattleState["stacks"][number]>,
): BattleState => ({
  ...s,
  stacks: s.stacks.map((x) => (x.id === id ? { ...x, ...p } : x)),
});

function ogres(): BattleState {
  return giveTurn(
    battle(
      {
        hero: {
          ...HERO,
          command: "heave-ho",
          commandC: 2,
          itemActs: ["a-pinch-of-sand"],
        },
        stacks: [unit("ogre", 2, at(4, 5)), unit("goblin", 30, at(2, 2))],
      },
      { stacks: [unit("squire", 5, at(6, 5))] },
    ),
    "a0",
  );
}

describe("the action bar", () => {
  it("lists the stack's, the hero's and the turn's actions with hotkeys", () => {
    const bar = actionBar(ogres(), MY_TURN);
    expect(bar.map((a) => [a.key, a.group, a.hotkey])).toEqual([
      ["ability:hurl", "stack", "1"],
      ["spells", "hero", "B"],
      ["command:heave-ho", "hero", "C"],
      ["item:a-pinch-of-sand", "hero", "2"],
      ["wait", "turn", "W"],
      ["defend", "turn", "D"],
      ["undo", "turn", "U"],
    ]);
    const hurl = byKey(bar, "ability:hurl");
    expect(hurl).toMatchObject({
      label: "Hurl",
      state: "ready",
      badge: "every turn",
      usage: "Every turn, in place of an attack, may walk first",
      mode: { kind: "ability", id: "hurl" },
    });
    expect(hurl.rule).toMatch(/at most 40 HP per Ogre in total/);
    expect(byKey(bar, "command:heave-ho")).toMatchObject({
      badge: "C2",
      icon: { icon: "skill", id: "banner" },
    });
    expect(byKey(bar, "command:heave-ho").usage).toMatch(
      /C = 2, up to 3 times\.$/,
    );
    expect(byKey(bar, "item:a-pinch-of-sand").icon).toEqual({
      icon: "artifact",
      id: "a-pinch-of-sand",
    });
    expect(actionForKey(bar, "c")?.key).toBe("command:heave-ho");
    expect(actionForKey(bar, "1")?.key).toBe("ability:hurl");
    expect(actionForKey(bar, "9")).toBeNull();
  });

  it("explains every disabled action", () => {
    let s = ogres();
    s = patch(s, "a0", { waitedThisRound: true });
    s = {
      ...s,
      sides: {
        ...s.sides,
        attacker: { ...s.sides.attacker, commandUsed: true },
      },
    };
    const bar = actionBar(s, MY_TURN);
    expect(byKey(bar, "command:heave-ho")).toMatchObject({
      state: "used",
      reason: "Used this battle (once per battle)",
      badge: "used",
    });
    expect(byKey(bar, "item:a-pinch-of-sand")).toMatchObject({
      state: "blocked",
      reason: "No valid target (a condition with a clock is needed)",
    });
    expect(byKey(bar, "wait").reason).toBe("Already waited this round");
    expect(byKey(bar, "undo").reason).toBe("Nothing to take back this round");
    expect(byKey(bar, "spells").reason).toBe("No spellbook");
    // Not the player's turn: every action says why.
    const enemy = actionBar(ogres(), {
      ...MY_TURN,
      playerTurn: false,
      notTurnReason: "The enemy's turn",
    });
    for (const key of ["ability:hurl", "defend", "wait", "spells"])
      expect(byKey(enemy, key).reason).toBe("The enemy's turn");
    const t = actionTooltip(byKey(enemy, "defend"));
    expect(t.title).toBe("Defend (D)");
    expect(t.reason).toBe("The enemy's turn");
  });

  it("says when an ability is used or has no target", () => {
    const squires = giveTurn(
      battle(
        { stacks: [unit("squire", 10, at(0, 5))] },
        { stacks: [unit("goblin", 10, at(14, 5))] },
      ),
      "a0",
    );
    expect(byKey(actionBar(squires, MY_TURN), "ability:attend")).toMatchObject({
      state: "blocked",
      reason: "No valid target within reach",
      badge: "once",
    });
    const used = patch(squires, "a0", { abilitiesUsed: ["attend"] });
    expect(byKey(actionBar(used, MY_TURN), "ability:attend")).toMatchObject({
      state: "used",
      reason: "Used this battle",
      badge: "used",
    });
  });

  it("checks a Command's targets: Last Rites needs remains", () => {
    const s = giveTurn(
      battle(
        {
          hero: { ...HERO, command: "last-rites", commandC: 1 },
          stacks: [unit("skeleton", 10, at(1, 5))],
        },
        { stacks: [unit("squire", 10, at(13, 5))] },
      ),
      "a0",
    );
    expect(byKey(actionBar(s, MY_TURN), "command:last-rites")).toMatchObject({
      state: "blocked",
      reason: "No remains on the field",
    });
    const withBones = {
      ...s,
      ground: [remains(at(7, 5), "skeleton", "attacker", "bones")],
    };
    expect(
      byKey(actionBar(withBones, MY_TURN), "command:last-rites").state,
    ).toBe("ready");
  });

  it("shows a caster's pages, spent or without a target", () => {
    const s = giveTurn(
      battle(
        { stacks: [unit("gravecaller", 5, at(1, 5))] },
        { stacks: [unit("squire", 10, at(13, 5))] },
      ),
      "a0",
    );
    const bar = actionBar(s, MY_TURN);
    expect(byKey(bar, "page:second-shift")).toMatchObject({
      state: "blocked",
      reason: "No remains of your stacks on the field",
      icon: { icon: "spell", id: "second-shift" },
      page: "second-shift",
    });
    const spent = patch(s, "a0", { abilitiesUsed: ["page:pass-on"] });
    expect(byKey(actionBar(spent, MY_TURN), "page:pass-on")).toMatchObject({
      state: "used",
      badge: "used",
    });
  });

  it("offers the Bomb's shot at a hex and says why it cannot shoot", () => {
    const s = giveTurn(
      battle(
        { stacks: [unit("bomb-chucker", 8, at(1, 5))] },
        { stacks: [unit("squire", 10, at(13, 5))] },
      ),
      "a0",
    );
    expect(byKey(actionBar(s, MY_TURN), "shoot-hex:bomb")).toMatchObject({
      label: "Bomb a hex",
      state: "ready",
      badge: "8",
      mode: { kind: "shootHex", id: "bomb" },
    });
    const pinned = {
      ...s,
      stacks: s.stacks.map((x) =>
        x.id === "d0" ? { ...x, hex: at(2, 5) } : x,
      ),
    };
    expect(shotBlocker(pinned, getStack(pinned, "a0"))).toBe(
      "An enemy stands adjacent",
    );
    expect(byKey(actionBar(pinned, MY_TURN), "shoot-hex:bomb").reason).toBe(
      "An enemy stands adjacent",
    );
    const empty = patch(s, "a0", { shotsLeft: 0 });
    expect(byKey(actionBar(empty, MY_TURN), "shoot-hex:bomb")).toMatchObject({
      state: "used",
      reason: "No shots left",
    });
  });

  it("shows the Heartened switch only while it can be spent", () => {
    const s = giveTurn(
      battle(
        { stacks: [unit("knight", 2, at(1, 5))] },
        { stacks: [unit("goblin", 10, at(12, 5))] },
      ),
      "a0",
    );
    expect(actionBar(s, MY_TURN).some((a) => a.key === "hearten")).toBe(false);
    const h = patch(s, "a0", {
      conditions: [
        {
          uid: 70,
          kind: "heartened",
          school: "accord",
          polarity: "boon",
          size: 0,
          maxSize: 0,
          clock: null,
          gate: null,
          hold: false,
          link: null,
          source: "test",
          roundsBorne: 0,
        },
      ],
    });
    expect(byKey(actionBar(h, MY_TURN), "hearten")).toMatchObject({
      hotkey: "H",
      label: "Spend Heartened",
      on: true,
      badge: "spend",
    });
    expect(
      byKey(actionBar(h, { ...MY_TURN, heartenSpend: false }), "hearten"),
    ).toMatchObject({ label: "Keep Heartened", on: false, badge: "keep" });
    const spentThisRound = patch(h, "a0", { extraTurnRound: h.round });
    expect(
      actionBar(spentThisRound, MY_TURN).some((a) => a.key === "hearten"),
    ).toBe(false);
  });
});
