/**
 * Battle AI v2 (bead bzc.20): key decisions on hand-built boards, and a
 * small fixed-seed smoke over real faction armies with heroes.
 */
import { describe, expect, it } from "vitest";
import { HEAVY_TIMEOUT } from "../../timeouts.ts";
import {
  actionError,
  applyAction,
  chooseAiAction,
  createBattle,
  engineSetupFromGame,
  hexDistance,
  scoreActions,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { BOW, OGRE, battle, withConditions } from "../magic/helpers.ts";
import { at, battle as factionBattle, unit } from "./faction-helpers.ts";
import {
  buildArmy,
  buildHero,
  gameSetup,
  guardSide,
  buildGuard,
  heroSide,
} from "../../sim/armies.ts";

function heroAct(a: BattleAction) {
  expect(a.type).toBe("heroAct");
  return a as Extract<BattleAction, { type: "heroAct" }>;
}

describe("battle AI v2: hero casts", () => {
  it("casts the spell that kills a valuable stack out of reach", () => {
    // Jolt at Power 2 is Harm 40: it kills the wounded Ogre (35 HP left).
    const s = battle({
      mine: [{ hex: at(0, 0) }],
      theirs: [{ creature: OGRE, count: 1, hex: at(14, 10) }],
      magic: { pages: ["jolt", "poultice"] },
    });
    const wounded: BattleState = {
      ...s,
      stacks: s.stacks.map((x) => (x.id === "d0" ? { ...x, topHp: 35 } : x)),
    };
    const a = heroAct(chooseAiAction(wounded));
    expect(a.act).toBe("jolt");
    expect(a.targets).toEqual([{ stack: "d0" }]);
    expect(a.fuel).toBeUndefined();
  });

  it("burns Fuel when that turns the spell into a kill", () => {
    // Jolt alone (Harm 40) leaves the Ogre alive (50 HP); burning its
    // Delayed (clock, opposed to storm) doubles the Harm to 80.
    const s = withConditions(
      battle({
        mine: [{ hex: at(0, 0) }],
        theirs: [{ creature: OGRE, count: 1, hex: at(14, 10) }],
        magic: { pages: ["jolt"] },
      }),
      "d0",
      [{ kind: "delayed", clock: 2 }],
    );
    const a = heroAct(chooseAiAction(s));
    expect(a.act).toBe("jolt");
    expect(a.fuel).toEqual({
      stack: "d0",
      condition: s.stacks.find((x) => x.id === "d0")!.conditions[0]!.uid,
    });
    const after = applyAction(s, a).state;
    expect(after.stacks.find((x) => x.id === "d0")!.count).toBe(0);
  });

  it("keeps its pages when nothing is worth a cast", () => {
    const s = battle({
      mine: [{ hex: at(0, 0) }],
      theirs: [{ hex: at(14, 10) }],
      magic: { pages: ["poultice"] },
    });
    // Nothing of ours is hurt: a heal is worth nothing.
    expect(chooseAiAction(s).type).not.toBe("heroAct");
  });
});

describe("battle AI v2: Commands, abilities and creature casters", () => {
  it("uses the Command when it kills several stacks", () => {
    // Kaboom: Harm 30 x C on a hex and its ring; three Squire stacks of 3.
    const s = factionBattle(
      {
        hero: { attack: 0, defense: 0, command: "kaboom", commandC: 1 },
        stacks: [unit("goblin", 10, at(0, 0))],
      },
      {
        stacks: [
          unit("squire", 3, at(11, 4)),
          unit("squire", 3, at(12, 4)),
          unit("squire", 3, at(11, 5)),
        ],
      },
    );
    const a = heroAct(chooseAiAction(s));
    expect(a.act).toBe("kaboom");
    const after = applyAction(s, a).state;
    expect(
      after.stacks.filter((x) => x.side === "defender" && x.count > 0),
    ).toHaveLength(0);
  });

  it("a creature caster casts its area page on a cluster", () => {
    const s = factionBattle(
      { stacks: [unit("boomshaman", 6, at(1, 5))] },
      {
        stacks: [
          unit("squire", 5, at(10, 4)),
          unit("squire", 5, at(11, 4)),
          unit("squire", 5, at(10, 5)),
        ],
      },
    );
    const a = chooseAiAction(s);
    expect(a.type).toBe("creatureCast");
    if (a.type === "creatureCast") expect(a.spell).toBe("thunderclap");
  });

  it("an activated ability is among the options and passes its check", () => {
    // Vampires next to an enemy: Mesmerise is offered (and legal).
    const s = factionBattle(
      { stacks: [unit("vampire", 2, at(5, 5), { extra: ["mesmerise"] })] },
      { stacks: [unit("squire", 20, at(6, 5))] },
    );
    const opts = scoreActions(s);
    const mesmerise = opts.filter(
      (o) => o.action.type === "ability" && o.action.ability === "mesmerise",
    );
    expect(mesmerise.length).toBeGreaterThan(0);
    for (const o of mesmerise) expect(actionError(s, o.action)).toBeNull();
  });
});

describe("battle AI v2: positional sense", () => {
  it("a shooter shoots a strong stack that cannot reach it next turn", () => {
    const s = battle({
      mine: [{ creature: BOW, count: 10, hex: at(1, 5) }],
      theirs: [{ creature: OGRE, count: 10, hex: at(9, 5) }],
      magic: { pages: [] },
    });
    expect(chooseAiAction(s)).toEqual({
      type: "shoot",
      stackId: "a0",
      targetId: "d0",
    });
  });

  it("does not leave its shooter where a much stronger stack reaches it", () => {
    // Ten Ogres (Speed 3) three hexes away would crush the Bowmen next
    // turn: the Bowmen step out of reach instead of trading one volley.
    const s = battle({
      mine: [{ creature: BOW, count: 10, hex: at(2, 5) }],
      theirs: [{ creature: OGRE, count: 10, hex: at(5, 5) }],
      magic: { pages: [] },
    });
    const a = chooseAiAction(s);
    expect(a.type).toBe("move");
    if (a.type === "move")
      expect(hexDistance(a.to, at(5, 5))).toBeGreaterThan(OGRE.speed + 1);
  });

  it("does not attack a much stronger stack in melee", () => {
    const s = battle({
      mine: [{ count: 3, hex: at(6, 5) }],
      theirs: [{ creature: OGRE, count: 10, hex: at(7, 5) }],
      magic: { pages: [] },
    });
    expect(chooseAiAction(s).type).not.toBe("attack");
  });
});

describe(
  "battle AI v2: determinism and a fixed-seed smoke",
  { timeout: HEAVY_TIMEOUT },
  () => {
    it("the same state always gives the same choice", () => {
      const setup = gameSetup(
        42,
        heroSide(
          "humans",
          buildHero("humans", 6, 42, "magic"),
          buildArmy("humans", 8000, 42),
          1,
        ),
        heroSide(
          "goblins",
          buildHero("goblins", 6, 43, "magic"),
          buildArmy("goblins", 8000, 43),
          2,
        ),
      );
      let s = createBattle(engineSetupFromGame(setup)).state;
      for (let i = 0; i < 12 && s.winner === null; i++) {
        const a = chooseAiAction(s);
        const clone = JSON.parse(JSON.stringify(s)) as BattleState;
        expect(chooseAiAction(clone)).toEqual(a);
        expect(chooseAiAction(s)).toEqual(a);
        s = applyAction(s, a).state;
      }
    });

    it("plays seeded faction and guard battles to the end with legal actions only", () => {
      const factions = ["humans", "undead", "goblins"] as const;
      let battles = 0;
      for (let i = 0; i < 3; i++) {
        const a = factions[i % 3]!;
        const d = factions[(i + 1) % 3]!;
        const seed = 500 + i;
        const setups = [
          gameSetup(
            seed,
            heroSide(
              a,
              buildHero(a, 5, seed, i % 2 === 0 ? "magic" : "might"),
              buildArmy(a, 5000, seed),
              1,
            ),
            heroSide(
              d,
              buildHero(d, 5, seed + 1, "magic"),
              buildArmy(d, 5000, seed + 1),
              2,
            ),
          ),
          gameSetup(
            seed,
            heroSide(
              a,
              buildHero(a, 5, seed, "might"),
              buildArmy(a, 5000, seed),
              1,
            ),
            guardSide(buildGuard(2500, seed)),
          ),
        ];
        for (const setup of setups) {
          let s = createBattle(engineSetupFromGame(setup)).state;
          let n = 0;
          while (s.winner === null) {
            const action = chooseAiAction(s);
            expect(actionError(s, action)).toBeNull();
            s = applyAction(s, action).state;
            expect(++n).toBeLessThan(3000);
          }
          battles++;
        }
      }
      expect(battles).toBe(6);
    });
  },
);
