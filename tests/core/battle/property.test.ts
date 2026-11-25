/**
 * previewAttack must equal what applyAction does, over many random states.
 */

import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/core/rng.ts";
import {
  applyAction,
  createBattle,
  getStack,
  legalActions,
  previewAttack,
} from "../../../src/core/battle/index.ts";
import type {
  AttackAction,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { randomArmy } from "./fixtures.ts";
import { damageEvents } from "./helpers.ts";

const BATTLES = 150;
const MAX_ACTIONS = 80;

describe("preview == apply (property)", () => {
  it(`holds for every attack in ${BATTLES} random battles`, () => {
    let checked = 0;
    let retaliations = 0;
    for (let seed = 0; seed < BATTLES; seed++) {
      const rng = createRng(1000 + seed);
      let state: BattleState = createBattle({
        seed,
        attacker: randomArmy(seed * 2 + 1, true),
        defender: randomArmy(seed * 2 + 2, seed % 2 === 0),
      }).state;
      for (let n = 0; n < MAX_ACTIONS && state.winner === null; n++) {
        const actions = legalActions(state);
        const attacks = actions.filter(
          (a): a is AttackAction => a.type === "attack" || a.type === "shoot",
        );
        const action =
          attacks.length > 0 && rng.chance(0.6)
            ? rng.pick(attacks)
            : rng.pick(actions);
        if (action.type !== "attack" && action.type !== "shoot") {
          state = applyAction(state, action).state;
          continue;
        }
        const before = JSON.stringify(state);
        const p = previewAttack(state, action);
        expect(JSON.stringify(state)).toBe(before); // preview is pure
        const step = applyAction(state, action);
        const dmg = damageEvents(step.events);
        const [hit, back] = dmg;
        expect(hit).toBeDefined();
        expect(p.noStrike).toBeNull();
        const strike = p.strike!;
        expect([
          hit!.damage,
          hit!.kills,
          hit!.countAfter,
          hit!.topHpAfter,
        ]).toEqual([
          p.damage,
          p.kills,
          strike.targetCountAfter,
          strike.targetTopHpAfter,
        ]);
        expect(hit!.breakdown).toEqual(strike.breakdown);
        expect(getStack(step.state, action.targetId).count).toBe(
          strike.targetCountAfter,
        );
        if (p.retaliation === null) {
          expect(dmg).toHaveLength(1);
          expect(p.retaliationDamage).toBe(0);
          expect(p.retaliationKills).toBe(0);
          expect(getStack(step.state, action.stackId).count).toBe(
            getStack(state, action.stackId).count,
          );
        } else {
          retaliations++;
          expect(back!.kind).toBe("retaliation");
          expect([back!.damage, back!.kills]).toEqual([
            p.retaliationDamage,
            p.retaliationKills,
          ]);
          expect(back!.breakdown).toEqual(p.retaliation.breakdown);
          expect(getStack(step.state, action.stackId).count).toBe(
            p.retaliation.targetCountAfter,
          );
        }
        // Kills are consistent with the counts before the action.
        expect(getStack(state, action.targetId).count - p.kills).toBe(
          strike.targetCountAfter,
        );
        checked++;
        state = step.state;
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(retaliations).toBeGreaterThan(100);
  });
});
