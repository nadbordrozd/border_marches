/**
 * Targeting modes of the action bar (src/ui/battle/targeting.ts): step
 * kinds and groups, valid targets tested by the engine, walk-first hexes,
 * multi-target Commands (back, complete, full), condition steps, the
 * shot at a hex, Hit and Run's step after and the Heartened switch.
 */

import { describe, expect, it } from "vitest";
import {
  BATTLE_HEIGHT,
  actionError,
  applyAction,
  getStack,
  hexDistance,
  isAdjacent,
  neighbors,
  previewAttack,
  sameHex,
} from "../../../src/core/battle/index.ts";
import type {
  ActTarget,
  AttackAction,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { giveTurn } from "../../../src/ui/battle/scenarios.ts";
import {
  addTarget,
  afterChoices,
  anyTarget,
  areaHexes,
  backStep,
  canHearten,
  choices,
  choicesAt,
  groupEnd,
  isComplete,
  isFull,
  modeAction,
  modePrompt,
  pickStack,
  startMode,
  stepKind,
  targetBounds,
  walkAfterRange,
  withAfter,
  withHearten,
} from "../../../src/ui/battle/targeting.ts";
import { at, battle, unit } from "../../core/battle/faction-helpers.ts";

const HERO = { attack: 0, defense: 0 };
const S = (stack: string): ActTarget => ({ stack });
const stacksOf = (list: readonly { target: ActTarget }[]): string[] =>
  list.flatMap((c) => ("stack" in c.target ? [c.target.stack] : []));

/** Ogres beside small and big stacks, with a hero who Heave-Hos. */
function hordeField(): BattleState {
  return giveTurn(
    battle(
      {
        hero: { ...HERO, command: "heave-ho", commandC: 1 },
        stacks: [
          unit("ogre", 2, at(4, 5)),
          unit("goblin", 30, at(2, 2)),
          unit("bomb-chucker", 10, at(1, 8)),
        ],
      },
      {
        stacks: [
          unit("squire", 5, at(6, 5)),
          unit("man-at-arms", 10, at(12, 5)),
        ],
      },
    ),
    "a0",
  );
}

describe("step kinds and groups", () => {
  const s = hordeField();

  it("repeats a Command's kinds in steps of targetStep", () => {
    const m = startMode(s, "command", "heave-ho");
    expect([0, 1, 2, 3, 4, 5].map((i) => stepKind(m, i))).toEqual([
      "stack",
      "hex",
      "stack",
      "hex",
      "stack",
      "hex",
    ]);
    expect(targetBounds(s, m)).toEqual({ min: 2, max: 4, step: 2 });
  });

  it("knows the shot at a hex, abilities and spells", () => {
    expect(stepKind(startMode(s, "shootHex", "bomb"), 0)).toBe("hex");
    expect(stepKind(startMode(s, "ability", "hurl"), 0)).toBe("stack");
    expect(stepKind(startMode(s, "page", "pass-on"), 0)).toBe("condition");
    expect(stepKind(startMode(s, "page", "pass-on"), 1)).toBe("stack");
  });

  it("ends a step group at min, then every step", () => {
    const b = { min: 2, max: 6, step: 2 };
    expect([0, 1, 2, 3, 4, 5].map((n) => groupEnd(n, b))).toEqual([
      2, 2, 4, 4, 6, 6,
    ]);
    expect(groupEnd(3, { min: 1, max: 3, step: 1 })).toBe(3);
  });
});

describe("an activated ability that may walk first (Hurl)", () => {
  const s = hordeField();
  const m = startMode(s, "ability", "hurl");
  const list = choices(s, m);

  it("offers exactly the stacks the engine allows, with walk-first hexes", () => {
    // 5 Squires (50 HP) are within 40 per Ogre (80); 10 Men-at-Arms are not,
    // and the far goblins are out of reach.
    expect(stacksOf(list)).toEqual(["d0"]);
    const c = list[0];
    if (!c) throw new Error("no choice");
    for (const f of c.froms) {
      expect(isAdjacent(f, getStack(s, "d0").hex)).toBe(true);
      expect(actionError(s, modeAction(s, m, [c.target], f))).toBeNull();
    }
    expect(c.froms.length).toBeGreaterThan(1);
  });

  it("is complete and full with one target; the action carries `from`", () => {
    const m1 = addTarget(m, S("d0"));
    expect(isComplete(s, m1)).toBe(true);
    expect(isFull(s, m1)).toBe(true);
    const from = list[0]?.froms.find((f) => !sameHex(f, getStack(s, "a0").hex));
    const a = modeAction(s, m1, m1.targets, from);
    expect(a).toMatchObject({ type: "ability", ability: "hurl", from });
    const moved = applyAction(s, a).events.find(
      (e) => e.type === "move" && e.mode === "push",
    );
    expect(moved?.type === "move" && moved.stackId).toBe("d0");
  });

  it("says when no target exists", () => {
    const far = giveTurn(
      battle(
        { stacks: [unit("ogre", 1, at(0, 5))] },
        { stacks: [unit("man-at-arms", 10, at(14, 5))] },
      ),
      "a0",
    );
    expect(anyTarget(far, startMode(far, "ability", "hurl"))).toBe(false);
    expect(anyTarget(s, m)).toBe(true);
  });
});

describe("a Command with several targets", () => {
  const s = giveTurn(
    battle(
      {
        hero: { ...HERO, command: "one-more-time", commandC: 3 },
        stacks: [
          unit("skeleton", 20, at(1, 2)),
          unit("ghoul", 10, at(1, 5)),
          unit("banshee", 5, at(1, 8)),
        ],
      },
      { stacks: [unit("squire", 10, at(13, 5))] },
    ),
    "a0",
  );

  it("walks the states: choose, back, complete, full", () => {
    let m = startMode(s, "command", "one-more-time");
    expect(targetBounds(s, m)).toEqual({ min: 1, max: 3, step: 1 });
    expect(stacksOf(choices(s, m))).toEqual(["a0", "a1", "a2"]);
    expect(isComplete(s, m)).toBe(false);
    m = addTarget(m, S("a1"));
    expect(isComplete(s, m)).toBe(true);
    expect(isFull(s, m)).toBe(false);
    // Each stack once: the chosen one is no longer offered.
    expect(stacksOf(choices(s, m))).toEqual(["a0", "a2"]);
    expect(modePrompt(s, m)).toBe(
      "Use 2 of up to 3: choose a stack. Enter uses it now.",
    );
    m = addTarget(addTarget(m, S("a0")), S("a2"));
    expect(isFull(s, m)).toBe(true);
    expect(choices(s, m)).toEqual([]);
    expect(actionError(s, modeAction(s, m))).toBeNull();
    const back = backStep(m);
    expect(back?.targets).toEqual([S("a1"), S("a0")]);
    expect(backStep(startMode(s, "command", "one-more-time"))).toBeNull();
  });

  it("pairs: a stack is offered only when some partner completes the pair", () => {
    const realm = giveTurn(
      battle(
        {
          hero: { ...HERO, command: "swear-in", commandC: 2 },
          stacks: [unit("knight", 2, at(0, 2)), unit("squire", 10, at(0, 4))],
        },
        { stacks: [unit("goblin", 10, at(14, 5))] },
      ),
      "a0",
    );
    let m = startMode(realm, "command", "swear-in");
    expect(stacksOf(choices(realm, m))).toEqual(["a0", "a1", "d0"]);
    m = addTarget(m, S("a0"));
    expect(modePrompt(realm, m)).toBe(
      "Use 1 of up to 2 (target 2 of 2): choose a stack.",
    );
    // The second of the pair: anyone but a0 itself.
    expect(stacksOf(choices(realm, m))).toEqual(["a1", "d0"]);
    m = addTarget(m, S("d0"));
    expect(isComplete(realm, m)).toBe(true);
    // A second pair needs two more unsworn stacks: only a1 is left.
    expect(choices(realm, m)).toEqual([]);
  });

  it("Heave-Ho offers hexes in a straight line and outlines the push", () => {
    const h = hordeField();
    let m = startMode(h, "command", "heave-ho");
    m = addTarget(m, S("a1"));
    const hexes = choices(h, m);
    expect(hexes.length).toBeGreaterThan(10);
    const goblins = getStack(h, "a1").hex;
    const east = { col: goblins.col + 2, row: goblins.row };
    expect(choicesAt(hexes, east)).toHaveLength(1);
    const line = areaHexes(h, m, [...m.targets, { hex: east }]);
    expect(line).toEqual([
      { col: 3, row: 2 },
      { col: 4, row: 2 },
      { col: 5, row: 2 },
      { col: 6, row: 2 },
    ]);
  });
});

describe("a condition step (A Pinch of Sand)", () => {
  const base = giveTurn(
    battle(
      {
        hero: { ...HERO, itemActs: ["a-pinch-of-sand"] },
        stacks: [unit("knight", 2, at(1, 5))],
      },
      { stacks: [unit("goblin", 10, at(12, 5))] },
    ),
    "a0",
  );

  it("offers only clocked conditions, then those of the picked stack", () => {
    expect(anyTarget(base, startMode(base, "item", "a-pinch-of-sand"))).toBe(
      false,
    );
    const s: BattleState = {
      ...base,
      stacks: base.stacks.map((x) =>
        x.id === "d0"
          ? {
              ...x,
              conditions: [
                {
                  uid: 50,
                  kind: "shaken",
                  school: "hush",
                  polarity: "bane",
                  size: 0,
                  maxSize: 0,
                  clock: 2,
                  gate: null,
                  hold: false,
                  link: null,
                  source: "test",
                  roundsBorne: 0,
                },
              ],
            }
          : x,
      ),
    };
    const m = startMode(s, "item", "a-pinch-of-sand");
    const list = choices(s, m);
    expect(list.map((c) => c.target)).toEqual([{ stack: "d0", condition: 50 }]);
    const picked = pickStack(m, "d0");
    expect(modePrompt(s, picked)).toBe(
      "Choose one of the conditions of the Goblins.",
    );
    expect(backStep(picked)?.pickFor).toBeNull();
    const done = addTarget(picked, { stack: "d0", condition: 50 });
    expect(done.pickFor).toBeNull();
    expect(isFull(s, done)).toBe(true);
    const after = applyAction(s, modeAction(s, done)).state;
    expect(getStack(after, "d0").conditions[0]?.clock).toBe(4);
  });
});

describe("a shot at a hex (Bomb)", () => {
  it("targets any hex and outlines the blast", () => {
    const s = giveTurn(hordeField(), "a2");
    const m = startMode(s, "shootHex", "bomb");
    expect(choices(s, m).length).toBe(165);
    const centre = { col: 7, row: 5 };
    const area = areaHexes(s, m, [{ hex: centre }]);
    expect(area).toEqual([centre, ...neighbors(centre)]);
    expect(modeAction(s, addTarget(m, { hex: centre }))).toEqual({
      type: "shootHex",
      stackId: "a2",
      at: centre,
    });
  });
});

describe("Hit and Run", () => {
  const field = (drilled: boolean): BattleState =>
    giveTurn(
      battle(
        {
          stacks: [
            unit("wolf-rider", 8, at(4, 5), {
              extra: drilled ? ["hit-and-run"] : [],
            }),
          ],
        },
        { stacks: [unit("squire", 10, at(8, 5))] },
      ),
      "a0",
    );
  const attack: AttackAction = {
    type: "attack",
    stackId: "a0",
    targetId: "d0",
    from: { col: 7, row: 5 },
  };

  it("offers hexes within the walk after the attack, on the rehearsed board", () => {
    const s = field(true);
    expect(walkAfterRange(getStack(s, "a0"))).toBe(3);
    const list = afterChoices(s, attack);
    expect(list.length).toBeGreaterThan(5);
    for (const c of list) {
      expect(hexDistance(c.hex, attack.from)).toBeLessThanOrEqual(3);
      expect(c.path.length).toBeLessThanOrEqual(3);
    }
    const to = list[list.length - 1]?.hex;
    if (!to) throw new Error("no hex");
    const a = withAfter(attack, to);
    expect(a).toMatchObject({ after: to });
    expect(getStack(applyAction(s, a).state, "a0").hex).toEqual(to);
    expect(withAfter(a, null)).toEqual(attack);
  });

  it("offers nothing without the ability", () => {
    expect(afterChoices(field(false), attack)).toEqual([]);
  });

  it("offers nothing when the riders burn on the way (no strike, no throw)", () => {
    const s = field(true);
    const fire = Array.from({ length: BATTLE_HEIGHT }, (_, row) => ({
      hex: at(5, row),
      kind: "fire",
      class: "hazard" as const,
      school: "storm" as const,
      size: 1000,
      clock: null,
      remains: null,
      source: "test",
    }));
    const burning: BattleState = { ...s, ground: [...s.ground, ...fire] };
    const p = previewAttack(burning, attack);
    expect(p.strike).toBeNull();
    expect(p.noStrike).toBe("attackerDied");
    expect(afterChoices(burning, attack)).toEqual([]);
  });
});

describe("Heartened: keep or spend", () => {
  it("keeps it with hearten: false on the actions that take the choice", () => {
    const keep = (a: Parameters<typeof withHearten>[0]) =>
      withHearten(a, false);
    expect(keep({ type: "defend", stackId: "a0" })).toEqual({
      type: "defend",
      stackId: "a0",
      hearten: false,
    });
    expect(
      keep({ type: "move", stackId: "a0", to: { col: 1, row: 1 } }),
    ).not.toHaveProperty("hearten");
    expect(keep({ type: "wait", stackId: "a0" })).not.toHaveProperty("hearten");
    const spend = { type: "defend" as const, stackId: "a0" };
    expect(withHearten(spend, true)).toBe(spend);
  });

  it("is offered while the active stack bears Heartened", () => {
    const s = giveTurn(
      battle(
        { stacks: [unit("knight", 2, at(1, 5))] },
        { stacks: [unit("goblin", 10, at(12, 5))] },
      ),
      "a0",
    );
    expect(canHearten(s)).toBe(false);
    const h: BattleState = {
      ...s,
      stacks: s.stacks.map((x) =>
        x.id === "a0"
          ? {
              ...x,
              conditions: [
                {
                  uid: 60,
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
            }
          : x,
      ),
    };
    expect(canHearten(h)).toBe(true);
    const kept = applyAction(
      h,
      withHearten({ type: "defend", stackId: "a0" }, false),
    );
    expect(getStack(kept.state, "a0").conditions.map((c) => c.kind)).toEqual([
      "heartened",
    ]);
    const spent = applyAction(h, { type: "defend", stackId: "a0" });
    expect(getStack(spent.state, "a0").conditions).toEqual([]);
  });
});
