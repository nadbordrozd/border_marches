/**
 * The battle screen's deployment phase controller (src/ui/battle/deploy.ts):
 * click to pick up and put down, drag, swap, the overlay marks, reset,
 * the AI suggestion and starting the battle.
 */
import { describe, expect, it } from "vitest";
import {
  aiDeployment,
  deployedHexes,
  hexIndex,
  type BattleSetup,
  type BattleState,
  type Hex,
} from "../../../src/core/battle/index.ts";
import { DeployPhase } from "../../../src/ui/battle/deploy.ts";
import { BOW, PIKE } from "../../core/magic/helpers.ts";

const at = (col: number, row: number): Hex => ({ col, row });

const SETUP: BattleSetup = {
  seed: 5,
  obstacles: [at(1, 8)],
  attacker: {
    hero: { attack: 0, defense: 0 },
    rules: ["vanguard-2"],
    stacks: [
      { creature: PIKE, count: 10 },
      { creature: BOW, count: 8 },
    ],
  },
  defender: { hero: null, stacks: [{ creature: PIKE, count: 9 }] },
};

function phase(): {
  p: DeployPhase;
  shown: BattleState[];
  started: BattleSetup[];
} {
  const shown: BattleState[] = [];
  const started: BattleSetup[] = [];
  const p = new DeployPhase(SETUP, "attacker", {
    changed: (s) => shown.push(s),
    done: (s) => started.push(s),
  });
  return { p, shown, started };
}

const hexes = (p: DeployPhase): Hex[] => deployedHexes(p.current(), "attacker");

describe("deployment phase", () => {
  it("click a stack, then a hex in the zone", () => {
    const { p, shown } = phase();
    expect(hexes(p)).toEqual([at(0, 2), at(0, 8)]);
    p.click(at(0, 2));
    expect(p.overlay().marks.get(hexIndex(at(0, 2)))).toBe("chosen");
    p.point(at(1, 3));
    expect(p.overlay().marks.get(hexIndex(at(1, 3)))).toBe("move-target");
    p.click(at(1, 3));
    expect(hexes(p)).toEqual([at(1, 3), at(0, 8)]);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.stacks.find((s) => s.id === "a0")?.hex).toEqual(at(1, 3));
  });

  it("refuses hexes outside the zone and rock, keeping the field", () => {
    const { p, shown } = phase();
    p.click(at(0, 2));
    p.point(at(4, 4));
    expect(p.cursor()).toBe("not-allowed");
    p.click(at(4, 4));
    expect(hexes(p)).toEqual([at(0, 2), at(0, 8)]);
    p.drag(at(0, 8), at(1, 8)); // rock
    expect(hexes(p)).toEqual([at(0, 2), at(0, 8)]);
    expect(shown).toHaveLength(0);
    // The zone marks skip the rock.
    expect(p.overlay().marks.has(hexIndex(at(1, 8)))).toBe(false);
    expect(p.overlay().marks.get(hexIndex(at(1, 9)))).toBe("act-valid");
  });

  it("drags, swaps, resets and suggests", () => {
    const { p } = phase();
    p.drag(at(0, 8), at(1, 7));
    expect(hexes(p)).toEqual([at(0, 2), at(1, 7)]);
    p.drag(at(0, 2), at(1, 7)); // onto a friend: swap
    expect(hexes(p)).toEqual([at(1, 7), at(0, 2)]);
    p.reset();
    expect(hexes(p)).toEqual([at(0, 2), at(0, 8)]);
    p.suggest();
    expect(hexes(p)).toEqual(aiDeployment(SETUP, "attacker"));
    expect(hexes(p)).toEqual([at(1, 2), at(0, 8)]);
  });

  it("Start battle hands over the deployed setup", () => {
    const { p, started } = phase();
    p.drag(at(0, 2), at(1, 1));
    p.start();
    expect(started).toHaveLength(1);
    expect(deployedHexes(started[0] as BattleSetup, "attacker")[0]).toEqual(
      at(1, 1),
    );
  });
});
