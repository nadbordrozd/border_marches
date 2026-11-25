/**
 * The deployment phase before round 1 (Vanguard, core/battle/deploy.ts):
 * zones, validation, the player's moves, the battle AI's placement and
 * instant battles taking it.
 */
import { describe, expect, it } from "vitest";
import {
  aiDeployment,
  autoDeploy,
  createBattle,
  deploy,
  deployError,
  deployZone,
  deployedHexes,
  deployingSides,
  fieldState,
  hasDeployment,
  redeploy,
  runAutoBattle,
  type BattleSetup,
  type BattleStackSetup,
  type Hex,
} from "../../../src/core/battle/index.ts";
import { BOW, PIKE } from "../magic/helpers.ts";

const HERO = { attack: 0, defense: 0 };
const at = (col: number, row: number): Hex => ({ col, row });

function setup(
  rules: string[],
  stacks: BattleStackSetup[] = [
    { creature: PIKE, count: 10 },
    { creature: BOW, count: 8 },
    { creature: PIKE, count: 6 },
  ],
  obstacles: Hex[] = [],
): BattleSetup {
  return {
    seed: 3,
    obstacles,
    attacker: { hero: HERO, rules, stacks },
    defender: {
      hero: HERO,
      stacks: [
        { creature: PIKE, count: 10 },
        { creature: BOW, count: 8 },
      ],
    },
  };
}

describe("deployment zones", () => {
  it("is an optional phase: only a side with a deploy rule deploys", () => {
    expect(hasDeployment(setup([]))).toBe(false);
    expect(deployingSides(setup(["vanguard-2"]))).toEqual(["attacker"]);
    // A neutral army has no hero, so no rule.
    const neutral = setup(["vanguard-2"]);
    expect(
      hasDeployment({
        ...neutral,
        attacker: { ...neutral.attacker, hero: null },
      }),
    ).toBe(false);
  });

  it("covers the side's first columns minus rocks", () => {
    const s = setup(["vanguard-2"], undefined, [at(1, 4)]);
    const zone = deployZone(s, "attacker");
    expect(zone).toHaveLength(21);
    expect(zone).not.toContainEqual(at(1, 4));
    expect(zone.every((h) => h.col <= 1)).toBe(true);
    const def = {
      ...s,
      defender: { ...s.defender, rules: ["vanguard-3"] },
    };
    expect(new Set(deployZone(def, "defender").map((h) => h.col))).toEqual(
      new Set([14, 13, 12]),
    );
  });

  it("refuses hexes outside the zone, on rock, or used twice", () => {
    const s = setup(["vanguard-2"], undefined, [at(1, 4)]);
    expect(deployError(s, "attacker", [at(0, 0), at(1, 5), at(0, 9)])).toBe(
      null,
    );
    expect(deployError(s, "attacker", [at(2, 0), at(1, 5), at(0, 9)])).toBe(
      "(2, 0) is outside the deployment zone",
    );
    expect(deployError(s, "attacker", [at(1, 4), at(1, 5), at(0, 9)])).toBe(
      "(1, 4) is outside the deployment zone",
    );
    expect(deployError(s, "attacker", [at(0, 0), at(0, 0), at(0, 9)])).toBe(
      "(0, 0) is used twice",
    );
    expect(deployError(s, "defender", [at(14, 0), at(14, 1)])).toBe(
      "this side does not deploy",
    );
  });
});

describe("the player's moves", () => {
  it("moves a stack to a free hex, or swaps with a friend", () => {
    const s = setup(["vanguard-2"]);
    expect(deployedHexes(s, "attacker")).toEqual([
      at(0, 2),
      at(0, 5),
      at(0, 8),
    ]);
    const moved = redeploy(s, "attacker", 0, at(1, 3));
    if (typeof moved === "string") throw new Error(moved);
    expect(deployedHexes(moved, "attacker")).toEqual([
      at(1, 3),
      at(0, 5),
      at(0, 8),
    ]);
    const swapped = redeploy(moved, "attacker", 2, at(0, 5));
    if (typeof swapped === "string") throw new Error(swapped);
    expect(deployedHexes(swapped, "attacker")).toEqual([
      at(1, 3),
      at(0, 8),
      at(0, 5),
    ]);
    expect(redeploy(s, "attacker", 0, at(4, 3))).toBe(
      "(4, 3) is outside the deployment zone",
    );
  });

  it("the deployed field is the battle's start, before battle-start rules", () => {
    const s = deploy(setup(["vanguard-2"]), "attacker", [
      at(1, 1),
      at(0, 5),
      at(1, 9),
    ]);
    const field = fieldState(s);
    expect(field.round).toBe(0);
    expect(field.activeStackId).toBeNull();
    const started = createBattle(s).state;
    expect(started.stacks.find((x) => x.id === "a0")?.hex).toEqual(at(1, 1));
    expect(started.stacks.find((x) => x.id === "a2")?.hex).toEqual(at(1, 9));
    expect(started.round).toBe(1);
    // The seeded rocks are fixed in the setup, so they never move.
    const seeded = setup(["vanguard-2"]);
    const noRocks: BattleSetup = {
      seed: seeded.seed,
      attacker: seeded.attacker,
      defender: seeded.defender,
    };
    const placed = deploy(
      noRocks,
      "attacker",
      deployedHexes(noRocks, "attacker"),
    );
    expect(placed.obstacles).toBeDefined();
    expect(fieldState(placed).ground).toEqual(fieldState(noRocks).ground);
  });
});

describe("the battle AI's placement", () => {
  it("puts shooters back and blockers forward, keeping rows", () => {
    const s = setup(["vanguard-3"]);
    expect(aiDeployment(s, "attacker")).toEqual([
      at(2, 2), // Pikemen forward
      at(0, 5), // Bowmen at the back
      at(2, 8),
    ]);
  });

  it("a rock in front: the blocker keeps its row, one column back", () => {
    const s = setup(["vanguard-2"], undefined, [at(1, 2)]);
    expect(aiDeployment(s, "attacker")[0]).toEqual(at(0, 2));
  });

  it("keeps the column with rank 1, and every placement is legal", () => {
    const s = setup(["vanguard-1"]);
    expect(aiDeployment(s, "attacker")).toEqual(deployedHexes(s, "attacker"));
    for (const rules of [["vanguard-2"], ["vanguard-3"]]) {
      const seven = setup(
        rules,
        Array.from({ length: 7 }, (_, i) => ({
          creature: i % 2 === 0 ? PIKE : BOW,
          count: 5,
        })),
        [at(1, 0), at(2, 4), at(1, 6), at(2, 10)],
      );
      expect(
        deployError(seven, "attacker", aiDeployment(seven, "attacker")),
      ).toBeNull();
    }
  });

  it("instant battles take the AI placement for every deploying side", () => {
    const base = setup(["vanguard-3"]);
    const s = {
      ...base,
      defender: { ...base.defender, rules: ["vanguard-2"] },
    };
    const auto = autoDeploy(s);
    expect(deployedHexes(auto, "attacker")).toEqual(
      aiDeployment(s, "attacker"),
    );
    expect(deployedHexes(auto, "defender")).toEqual([at(13, 2), at(14, 8)]);
    const played = runAutoBattle(s, { maxRounds: 1 });
    const direct = runAutoBattle(auto, { maxRounds: 1 });
    expect(played.result).toEqual(direct.result);
    // No deploy rule: the setup is untouched.
    const plain = setup([]);
    expect(autoDeploy(plain)).toBe(plain);
  });
});
