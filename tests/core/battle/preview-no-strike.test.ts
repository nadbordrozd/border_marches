/**
 * previewAttack on legal attacks that end without the strike (bzc.33): the
 * attacker walks into hazard ground and dies, the target dies before the
 * strike, or the shot is taken by something else. The preview says so
 * (strike null, noStrike) and matches what applyAction does; it never throws.
 */

import { describe, expect, it } from "vitest";
import {
  BATTLE_HEIGHT,
  applyAction,
  createBattle,
  findPath,
  getStack,
  isLegalAction,
  previewAttack,
  registerAbility,
} from "../../../src/core/battle/index.ts";
import type {
  AttackAction,
  BattleStackSetup,
  BattleState,
  GroundSpec,
} from "../../../src/core/battle/index.ts";
import { at, stats, unit } from "./faction-helpers.ts";
import { damageEvents, withFx } from "./helpers.ts";

/** Hazard ground on every hex of a column: any walk across it enters it. */
function wall(col: number, kind: string, size: number): GroundSpec[] {
  return Array.from({ length: BATTLE_HEIGHT }, (_, row) => ({
    hex: at(col, row),
    kind,
    size,
  }));
}

function board(
  attacker: BattleStackSetup[],
  defender: BattleStackSetup[],
  ground: GroundSpec[] = [],
): BattleState {
  return createBattle({
    seed: 1,
    obstacles: [],
    attacker: { hero: null, stacks: attacker },
    defender: { hero: null, stacks: defender },
    ground,
  }).state;
}

const charge: AttackAction = {
  type: "attack",
  stackId: "a0",
  targetId: "d0",
  from: at(7, 5),
};

/** Previews, then applies, and checks both agree that nothing struck. */
function expectNoStrike(state: BattleState, action: AttackAction) {
  expect(isLegalAction(state, action)).toBe(true);
  const before = JSON.stringify(state);
  const p = previewAttack(state, action);
  expect(JSON.stringify(state)).toBe(before); // still pure
  expect(p.strike).toBeNull();
  expect(p.retaliation).toBeNull();
  expect([p.damage, p.kills, p.retaliationDamage, p.retaliationKills]).toEqual([
    0, 0, 0, 0,
  ]);
  const step = applyAction(state, action);
  const struck = damageEvents(step.events).filter(
    (e) => e.sourceId === action.stackId && e.targetId === action.targetId,
  );
  expect(struck).toEqual([]);
  return { p, step };
}

describe("previewAttack when no strike lands", () => {
  it("Wolf Riders walking into fire on the path die on the way: no attack", () => {
    const s = board(
      [unit("wolf-rider", 2, at(3, 5))],
      [unit("skeleton", 5, at(8, 5)), unit("skeleton", 5, at(14, 0))],
      wall(5, "fire", 100),
    );
    expect(s.activeStackId).toBe("a0");
    expect(findPath(s, "a0", at(7, 5))?.some((h) => h.col === 5)).toBe(true);
    const { p, step } = expectNoStrike(s, charge);
    expect(p.noStrike).toBe("attackerDied");
    // They die on the second hex (column 5), not at the attack hex.
    expect(p.hexesMoved).toBe(2);
    const harm = p.chain.find((e) => e.type === "harm");
    expect(harm).toMatchObject({
      targetId: "a0",
      rule: "ground:fire",
      countAfter: 0,
    });
    expect(p.chain.some((e) => e.type === "death" && e.stackId === "a0")).toBe(
      true,
    );
    expect(p.chain.some((e) => e.type === "attack")).toBe(false);
    // applyAction agrees: the riders are dead, the skeletons untouched.
    expect(getStack(step.state, "a0").count).toBe(0);
    expect(getStack(step.state, "d0").count).toBe(5);
  });

  it("a stack killed by a hazard mid-walk dies on that hex: move cut, remains there", () => {
    const s = board(
      [unit("wolf-rider", 2, at(3, 5))],
      [unit("skeleton", 5, at(8, 5)), unit("skeleton", 5, at(14, 0))],
      wall(5, "fire", 100),
    );
    const path = findPath(s, "a0", at(7, 5))!;
    const fireAt = path.findIndex((h) => h.col === 5);
    const deathHex = path[fireAt]!;
    const step = applyAction(s, charge);
    // The move event ends on the fire hex; the animator walks only that far.
    const move = step.events.find((e) => e.type === "move");
    expect(move).toMatchObject({
      stackId: "a0",
      from: at(3, 5),
      to: deathHex,
      path: path.slice(0, fireAt + 1),
      mode: "walk",
    });
    // Harm, death, then remains on the fire hex (replacing the fire).
    const types = step.events.map((e) => e.type);
    expect(types.indexOf("harm")).toBeLessThan(types.indexOf("death"));
    const riders = getStack(step.state, "a0");
    expect(riders.hex).toEqual(deathHex);
    const g = step.state.ground.find(
      (x) => x.hex.col === deathHex.col && x.hex.row === deathHex.row,
    );
    expect(g).toMatchObject({ class: "remains", source: "a0" });
    expect(
      step.state.ground.some(
        (x) => x.class === "remains" && x.hex.col === 7 && x.hex.row === 5,
      ),
    ).toBe(false);
    // The preview's chain is the same rehearsal.
    expect(previewAttack(s, charge).chain).toEqual(
      step.events.slice(0, previewAttack(s, charge).chain.length),
    );
  });

  it("a native Skeleton burnt mid-walk gets up on the hex where it died", () => {
    const s = createBattle({
      seed: 1,
      obstacles: [],
      attacker: {
        hero: null,
        birthright: "not-done-yet",
        stacks: [
          unit("skeleton", 4, at(3, 5), { native: true }),
          unit("skeleton", 4, at(0, 0)),
        ],
      },
      defender: { hero: null, stacks: [unit("ogre", 1, at(8, 5))] },
      ground: wall(5, "fire", 200),
    }).state;
    expect(s.activeStackId).toBe("a0");
    const path = findPath(s, "a0", at(7, 5))!;
    const deathHex = path.find((h) => h.col === 5)!;
    let state = applyAction(s, charge).state;
    expect(getStack(state, "a0").count).toBe(0);
    expect(getStack(state, "a0").hex).toEqual(deathHex);
    for (let n = 0; n < 10 && state.round === s.round; n++) {
      state = applyAction(state, {
        type: "defend",
        stackId: state.activeStackId!,
      }).state;
    }
    const risen = getStack(state, "a0");
    expect(risen.count).toBeGreaterThan(0);
    expect(risen.hex).toEqual(deathHex);
  });

  it("a stack that survives the hazards walks the whole path", () => {
    const s = board(
      [unit("wolf-rider", 10, at(3, 5))],
      [unit("skeleton", 5, at(8, 5)), unit("skeleton", 5, at(14, 0))],
      wall(5, "fire", 5),
    );
    const path = findPath(s, "a0", at(7, 5))!;
    const step = applyAction(s, charge);
    expect(step.events.find((e) => e.type === "move")).toMatchObject({
      to: at(7, 5),
      path,
    });
    expect(previewAttack(s, charge).hexesMoved).toBe(path.length);
  });

  it("brambles (another walk hazard) that kill the walker: no attack", () => {
    const s = board(
      [unit("wolf-rider", 1, at(3, 5))],
      [unit("skeleton", 5, at(8, 5)), unit("skeleton", 5, at(14, 0))],
      wall(5, "brambles", 100),
    );
    const { p } = expectNoStrike(s, charge);
    expect(p.noStrike).toBe("attackerDied");
    expect(p.chain.find((e) => e.type === "harm")).toMatchObject({
      rule: "ground:brambles",
    });
  });

  it("an attacker that survives the fire still strikes, after the Harm", () => {
    const s = board(
      [unit("wolf-rider", 10, at(3, 5))],
      [unit("skeleton", 5, at(8, 5)), unit("skeleton", 5, at(14, 0))],
      wall(5, "fire", 5),
    );
    const p = previewAttack(s, charge);
    expect(p.noStrike).toBeNull();
    expect(p.strike).not.toBeNull();
    const harmAt = p.chain.findIndex((e) => e.type === "harm");
    const hitAt = p.chain.findIndex((e) => e.type === "damage");
    expect(harmAt).toBeGreaterThanOrEqual(0);
    expect(harmAt).toBeLessThan(hitAt);
  });

  it("a target killed on the way (fire Harm carried down a Scapegoat link) is not struck", () => {
    let s = board(
      [unit("wolf-rider", 10, at(3, 5))],
      [unit("skeleton", 1, at(8, 5)), unit("skeleton", 5, at(14, 0))],
      wall(5, "fire", 100),
    );
    // The riders' Harm goes to the lone skeleton at the far end.
    s = withFx(s, (fx) => fx.link("a0", "d0", { kind: "scapegoat" })).state;
    const { p, step } = expectNoStrike(s, charge);
    expect(p.noStrike).toBe("targetDied");
    // The skeleton dies; the excess comes back to the riders, who live.
    expect(getStack(step.state, "d0").count).toBe(0);
    expect(getStack(step.state, "a0").count).toBeGreaterThan(0);
  });

  it("a shot whose ability strikes nothing is averted", () => {
    registerAbility({
      id: "test-dud-shot",
      name: "Dud",
      description: "The shot fizzles (test content).",
      shot() {},
    });
    const dud = { ...stats("bomb-chucker"), abilities: ["test-dud-shot"] };
    const s = board(
      [{ creature: dud, count: 5, hex: at(1, 5) }],
      [unit("skeleton", 5, at(12, 5))],
    );
    const shot: AttackAction = { type: "shoot", stackId: "a0", targetId: "d0" };
    const { p } = expectNoStrike(s, shot);
    expect(p.noStrike).toBe("averted");
  });
});
