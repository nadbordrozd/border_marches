/**
 * Item acts (RULES_V2 4.6 form 4, CONTENT_ARTIFACTS 3 and 5): one
 * hand-built use of each registered item act, once per battle; and the
 * hero's Spell specialty, The Missing Page and The Unspent Page as they
 * reach the battle.
 */
import { describe, expect, it } from "vitest";
import {
  actionError,
  applyAction,
  neighbors,
  type BattleAction,
  type BattleState,
  type Hex,
} from "../../../src/core/battle/index.ts";
import { ITEM_ACT_IDS } from "../../../src/core/battle/hero-effects.ts";
import { heroBattleProfile } from "../../../src/core/game/index.ts";
import { unspentPageOf } from "../../../src/core/game/battle-profile.ts";
import { magicFromProfile } from "../../../src/core/battle/resolver.ts";
import { ARTIFACT_LIST } from "../../../src/data/artifacts.ts";
import {
  battle,
  C,
  S,
  kinds,
  stack,
  withConditions,
} from "../magic/helpers.ts";
import { field, gameOn } from "../game/helpers.ts";

const CENTRE: Hex = { col: 7, row: 5 };
const around = neighbors(CENTRE);

/** a0 acts first; a1 at the centre with a2 and d0 beside it. */
function board(items: readonly string[]): BattleState {
  const s = battle({
    mine: [
      { hex: { col: 1, row: 1 } },
      { hex: CENTRE, count: 5 },
      { hex: around[3] as Hex },
    ],
    theirs: [{ hex: around[0] as Hex }],
  });
  return {
    ...s,
    stacks: s.stacks.map((x) =>
      x.id === "a1" ? { ...x, initialCount: 10 } : x,
    ),
    sides: {
      ...s.sides,
      attacker: {
        ...s.sides.attacker,
        hero: { attack: 0, defense: 0, itemActs: items },
      },
    },
  };
}

const item = (
  s: BattleState,
  act: string,
  targets: BattleAction extends never
    ? never
    : Extract<BattleAction, { type: "heroAct" }>["targets"],
): BattleAction => ({
  type: "heroAct",
  stackId: s.activeStackId as string,
  act,
  targets,
});

describe("item acts", () => {
  it("every artifact item act is registered and listed", () => {
    const acts = ARTIFACT_LIST.flatMap((a) =>
      a.kind === "worn" ? (a.itemActs ?? []) : [],
    );
    expect([...acts].sort()).toEqual([...ITEM_ACT_IDS].sort());
  });

  it("Tinderbox: one more Fuel, once per battle", () => {
    const s0 = board(["tinderbox"]);
    expect(s0.sides.attacker.magic!.fuelMax).toBe(1);
    const s1 = applyAction(s0, item(s0, "tinderbox", [])).state;
    expect(s1.sides.attacker.magic!.fuelMax).toBe(2);
    expect(actionError(s1, item(s1, "tinderbox", []))).toMatch(/used/);
    expect(actionError(board([]), item(s0, "tinderbox", []))).toMatch(
      /no such item/,
    );
  });

  it("Cider Flask: ends Ripening and heals 3 x its size, reviving", () => {
    const s0 = withConditions(board(["cider-flask"]), "a1", [
      { kind: "ripening", size: 10 },
    ]);
    const s1 = applyAction(
      s0,
      item(s0, "cider-flask", [C(s0, "a1", "ripening")]),
    ).state;
    expect(kinds(s1, "a1")).not.toContain("ripening");
    expect(stack(s1, "a1").count).toBe(8); // 5 + 30 HP of 10-HP Pikemen
    const foe = withConditions(board(["cider-flask"]), "d0", [
      { kind: "ripening", size: 10 },
    ]);
    expect(
      actionError(foe, item(foe, "cider-flask", [C(foe, "d0", "ripening")])),
    ).toMatch(/yours/);
  });

  it("The Bellhop's Cap: moves a condition between two stacks beside yours", () => {
    const s0 = withConditions(board(["the-bellhops-cap"]), "a2", [
      { kind: "slowed", size: 2, clock: 2 },
    ]);
    const act = item(s0, "the-bellhops-cap", [
      S("a1"),
      C(s0, "a2", "slowed"),
      S("d0"),
    ]);
    expect(actionError(s0, act)).toBeNull();
    const s1 = applyAction(s0, act).state;
    expect(kinds(s1, "a2")).not.toContain("slowed");
    expect(kinds(s1, "d0")).toContain("slowed");
    expect(
      actionError(
        s0,
        item(s0, "the-bellhops-cap", [S("d0"), C(s0, "a2", "slowed"), S("a1")]),
      ),
    ).toMatch(/yours/);
  });

  it("A Pinch of Sand: winds a clock by 2 the helpful way", () => {
    const s0 = withConditions(board(["a-pinch-of-sand"]), "a1", [
      { kind: "fired-up", size: 2, clock: 2 },
    ]);
    const s1 = applyAction(
      s0,
      item(s0, "a-pinch-of-sand", [C(s0, "a1", "fired-up")]),
    ).state;
    expect(
      stack(s1, "a1").conditions.find((c) => c.kind === "fired-up")?.clock,
    ).toBe(4);
  });
});

describe("pages and the hero profile", () => {
  const hero = () => {
    const s = gameOn(field(4, 3), [], 1, 1);
    const h = structuredClone(s.heroes[0]!);
    h.defId = "nobody";
    h.pages = ["nettle", "jolt", "deadline", "ripen"];
    return h;
  };

  it("The Missing Page spends the highest-tier page before round 1", () => {
    const h = hero();
    h.worn[2] = null;
    h.worn[0] = "the-missing-page";
    const p = heroBattleProfile(h);
    expect(p.startSpent).toEqual(["deadline"]);
    const battleState = battle({
      mine: [{ hex: { col: 1, row: 1 } }],
      theirs: [{ hex: CENTRE }],
      magic: magicFromProfile(p),
    });
    expect(battleState.sides.attacker.magic!.spent).toEqual(["deadline"]);
  });

  it("The Unspent Page keeps the chosen page, else the highest tier", () => {
    const h = hero();
    h.worn[1] = "the-unspent-page";
    expect(heroBattleProfile(h).unspentPage).toBe("deadline");
    h.unspentPage = "jolt";
    expect(unspentPageOf(h)).toBe("jolt");
    expect(magicFromProfile(heroBattleProfile(h)).unspentPage).toBe("jolt");
  });

  it("named Spell specialties reach the battle (Abbess Wilhelmina: Mend)", () => {
    const h = hero();
    h.defId = "wilhelmina";
    h.heroClass = "enchanter";
    h.level = 10;
    h.pages = [...h.pages, "mend"];
    const p = heroBattleProfile(h);
    expect(p.spellPower).toEqual({ mend: 4 }); // 2 + 10 / 5
    expect(magicFromProfile(p).spellPower).toEqual({ mend: 4 });
  });

  it("a Spell specialty casts its spell at +2 Power (+1 per 5 levels)", () => {
    const h = hero();
    h.level = 5;
    // A named hero with a Spell specialty arrives with the factions bead;
    // the specialty is an effect like any other.
    const p0 = heroBattleProfile(h);
    expect(p0.spellPower).toEqual({});
    const withSpec = {
      ...p0,
      spellPower: { jolt: 3 },
    };
    const s = battle({
      mine: [{ hex: { col: 1, row: 1 } }],
      theirs: [{ hex: CENTRE }],
      magic: magicFromProfile(withSpec),
    });
    const s1 = applyAction(s, {
      type: "heroAct",
      stackId: "a0",
      act: "jolt",
      targets: [S("d0")],
    });
    const cast = s1.events.find((e) => e.type === "heroAct");
    const plain = applyAction(
      battle({
        mine: [{ hex: { col: 1, row: 1 } }],
        theirs: [{ hex: CENTRE }],
        magic: magicFromProfile(p0),
      }),
      { type: "heroAct", stackId: "a0", act: "jolt", targets: [S("d0")] },
    ).events.find((e) => e.type === "heroAct");
    expect(
      cast?.type === "heroAct" && plain?.type === "heroAct"
        ? (cast.cast?.power ?? 0) - (plain.cast?.power ?? 0)
        : -1,
    ).toBe(3);
  });
});
