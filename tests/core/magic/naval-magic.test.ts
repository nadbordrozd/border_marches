/**
 * The naval layer's battle magic (docs/design/NAVAL.md 7.2 and 7.4, bead
 * bzc.154): Tidal Wave sweeps a row on land and at sea, and the Conch of
 * the Deep summons Hermit Crabs, which may stand on sea hexes.
 */
import { describe, expect, it } from "vitest";
import {
  act,
  actionError,
  applyAction,
  createBattle,
  groundAt,
  hexIndex,
  swims,
} from "../../../src/core/battle/index.ts";
import type {
  ActTarget,
  BattleAction,
  BattleCreatureStats,
  BattleState,
  Hex,
} from "../../../src/core/battle/index.ts";
import {
  CONCH_ACT,
  HERMIT_CRAB,
  isFreeHex,
  isFreeHexFor,
  rowHexes,
  ruleCandidates,
  spellDef,
  targetRuleError,
} from "../../../src/core/magic/index.ts";
import { CREATURES } from "../../../src/data/creatures.ts";
import { battleStatsFromCreature } from "../../../src/core/battle/index.ts";
import {
  BOOK,
  H,
  PIKE,
  battle,
  cast,
  castAction,
  hpLost,
  ref,
  stack,
  withConditions,
} from "./helpers.ts";

const at = (col: number, row: number): Hex => ({ col, row });

/** A sturdy plain stack (lots of HP), so Harm never kills it here. */
const WALL: BattleCreatureStats = { ...PIKE, id: "wall", hp: 400 };
const LEAD: BattleCreatureStats = { ...WALL, id: "lead", speed: 9 };
const SHARK = battleStatsFromCreature(CREATURES.hammerhead);

/** The cast event's Power. */
function powerOf(step: ReturnType<typeof cast>): number {
  const ev = step.events.find((e) => e.type === "heroAct") as
    { cast?: { power: number } } | undefined;
  return ev?.cast?.power ?? -1;
}

describe("Tidal Wave (NAVAL 7.2)", () => {
  const storm3 = { schoolRanks: { ...BOOK.schoolRanks, storm: 3 } };

  it("is a tier 4 Storm row spell, drawn only on naval maps", () => {
    const s = spellDef("tidal-wave");
    expect([s.school, s.tier, s.mana, s.target, s.fuel, s.naval]).toEqual([
      "storm",
      4,
      14,
      "row",
      "The Harm",
      true,
    ]);
  });

  it("harms every stack in the row, friend and foe, and pushes each 2 hexes away from the caster's edge", () => {
    const s0 = battle({
      mine: [
        { hex: at(0, 1), creature: LEAD },
        { hex: at(3, 5), creature: WALL },
      ],
      theirs: [
        { hex: at(9, 5), creature: WALL },
        { hex: at(13, 5), creature: WALL },
        { hex: at(9, 7), creature: WALL },
      ],
      magic: storm3,
    });
    const step = cast(s0, "tidal-wave", [H(7, 5)]);
    const p = powerOf(step);
    expect(p).toBeGreaterThan(0);
    const harm = 36 + 15 * p;
    const s1 = step.state;
    for (const id of ["a1", "d0", "d1"])
      expect(hpLost(s0, s1, id), id).toBe(harm);
    expect(hpLost(s0, s1, "d2")).toBe(0);
    expect(hpLost(s0, s1, "a0")).toBe(0);
    // Pushed east (the attacker's edge is the west), along the row.
    expect(stack(s1, "a1").hex).toEqual(at(5, 5));
    expect(stack(s1, "d0").hex).toEqual(at(11, 5));
    // The field's edge stops d1 after one hex.
    expect(stack(s1, "d1").hex).toEqual(at(14, 5));
    expect(stack(s1, "d2").hex).toEqual(at(9, 7));
  });

  it("resolves in timeline order: a pushed stack stops against one not yet pushed", () => {
    // d0 (Speed 5) goes before d1 (Speed 3) and stops against it.
    const slow = { ...WALL, id: "slow", speed: 3 };
    const s0 = battle({
      mine: [{ hex: at(0, 1), creature: LEAD }],
      theirs: [
        { hex: at(9, 5), creature: WALL },
        { hex: at(10, 5), creature: slow },
      ],
      magic: storm3,
    });
    const s1 = cast(s0, "tidal-wave", [H(2, 5)]).state;
    expect(stack(s1, "d0").hex).toEqual(at(9, 5));
    expect(stack(s1, "d1").hex).toEqual(at(12, 5));
  });

  it("Fuel doubles the Harm", () => {
    // Shielded is Accord, opposed to Storm: it can be burnt as Fuel.
    const s0 = withConditions(
      battle({
        mine: [{ hex: at(0, 1), creature: LEAD }],
        theirs: [{ hex: at(9, 5), creature: WALL }],
        magic: storm3,
      }),
      "d0",
      [{ kind: "shielded", size: 2, clock: 3 }],
    );
    const plain = cast(s0, "tidal-wave", [H(9, 5)]);
    const p = powerOf(plain);
    const fuelled = cast(s0, "tidal-wave", [H(9, 5)], {
      fuel: ref(s0, "d0", "shielded"),
    });
    expect(hpLost(s0, fuelled.state, "d0")).toBe(2 * (36 + 15 * p));
    expect(stack(fuelled.state, "d0").hex).toEqual(at(11, 5));
  });

  it("touches the row's stacks, needs a hex on the field, and is aimed at rows with an enemy", () => {
    const s0 = battle({
      mine: [{ hex: at(0, 1), creature: LEAD }],
      theirs: [
        { hex: at(9, 5), creature: WALL },
        { hex: at(9, 8), creature: WALL },
      ],
      magic: storm3,
    });
    const actor = s0.activeStackId as string;
    expect(targetRuleError("row", s0, actor, [H(3, 5)])).toBeNull();
    expect(targetRuleError("row", s0, actor, [H(3, 11)])).toBe("choose a row");
    expect(targetRuleError("row", s0, actor, [])).toBe("choose a row");
    expect(
      ruleCandidates("row", s0, actor).map((t) => (t[0] as { hex: Hex }).hex),
    ).toEqual([at(7, 5), at(7, 8)]);
    expect(rowHexes(4)).toHaveLength(15);
    expect(rowHexes(4).every((h) => h.row === 4)).toBe(true);
  });

  it("at sea the push stops a walker at the rail; a Swimmer is pushed on through the water", () => {
    const st = createBattle({
      seed: 3,
      layout: "open-water",
      attacker: {
        hero: { attack: 0, defense: 0 },
        magic: { ...BOOK, ...storm3 },
        stacks: [
          { creature: LEAD, count: 5, hex: at(0, 0) },
          { creature: WALL, count: 5, hex: at(3, 9) },
        ],
      },
      defender: {
        hero: null,
        stacks: [{ creature: SHARK, count: 20, hex: at(10, 9) }],
      },
    }).state;
    const s0 = clearRow(st, 9, [5, 11, 12]);
    const s1 = cast(s0, "tidal-wave", [H(6, 9)]).state;
    // The deck ends at column 4; column 5 is sea.
    expect(groundAt(s1, at(5, 9))?.kind).toBe("sea");
    expect(stack(s1, "a1").hex).toEqual(at(4, 9));
    expect(stack(s1, "d0").hex).toEqual(at(12, 9));
  });
});

/** Test surgery: no reef on these columns of a row (sea stays sea). */
function clearRow(
  s: BattleState,
  row: number,
  cols: readonly number[],
): BattleState {
  return {
    ...s,
    ground: s.ground.map((g) => {
      if (g.hex.row !== row || !cols.includes(g.hex.col) || g.kind === "sea")
        return g;
      const rest = { ...g, kind: "sea" };
      delete (rest as { look?: string }).look;
      return rest;
    }),
  };
}

describe("the Conch of the Deep (NAVAL 7.4)", () => {
  /** Open water: our deck in columns 0-4, the sea beyond. */
  function openWater(itemActs: readonly string[] = [CONCH_ACT]): BattleState {
    return createBattle({
      seed: 5,
      layout: "open-water",
      attacker: {
        hero: { attack: 0, defense: 0, itemActs },
        magic: BOOK,
        stacks: [{ creature: LEAD, count: 5, hex: at(1, 5) }],
      },
      defender: {
        hero: null,
        stacks: [{ creature: SHARK, count: 3, hex: at(14, 5) }],
      },
    }).state;
  }

  const conch = (s: BattleState, target: ActTarget[]): BattleAction => ({
    type: "heroAct",
    stackId: s.activeStackId as string,
    act: CONCH_ACT,
    targets: target,
  });

  /** A sea hex of the field with nothing on it. */
  function freeSea(s: BattleState): Hex {
    const g = s.ground.find(
      (x) =>
        x.kind === "sea" &&
        !s.stacks.some((st) => hexIndex(st.hex) === hexIndex(x.hex)),
    );
    if (g === undefined) throw new Error("no free sea hex");
    return g.hex;
  }

  it("summons 12 Hermit Crabs (120 HP) on a sea hex: free to them, not to a walker", () => {
    const s0 = openWater();
    expect(s0.activeStackId).toBe("a0");
    const sea = freeSea(s0);
    // A sea hex is not free for a non-swimming summon (Sprout's Seedlings).
    expect(isFreeHex(s0, sea)).toBe(false);
    expect(isFreeHexFor(s0, sea, HERMIT_CRAB)).toBe(true);
    const step = applyAction(s0, conch(s0, [{ hex: sea }]));
    const crab = step.state.stacks.find((x) => x.summoned);
    expect(crab).toBeDefined();
    expect(crab!.creature.id).toBe("hermit-crab");
    expect(crab!.count).toBe(12);
    expect(crab!.count * crab!.creature.hp).toBe(120);
    expect(crab!.hex).toEqual(sea);
    expect(crab!.owner).toBe("attacker");
    expect(swims(crab!.creature)).toBe(true);
    // Once per battle.
    expect(step.state.sides.attacker.itemActsUsed).toContain(CONCH_ACT);
  });

  it("also lands on the deck, and refuses a taken or blocking hex", () => {
    const s0 = openWater();
    expect(actionError(s0, conch(s0, [{ hex: at(2, 5) }]))).toBeNull();
    expect(actionError(s0, conch(s0, [{ hex: at(1, 5) }]))).toMatch(
      /empty hex/,
    );
    const mast = s0.ground.find((g) => g.kind === "mast");
    expect(mast).toBeDefined();
    expect(actionError(s0, conch(s0, [{ hex: mast!.hex }]))).toMatch(
      /empty hex/,
    );
  });

  it("needs the artifact: a hero without it cannot use the act", () => {
    const s0 = openWater([]);
    expect(actionError(s0, conch(s0, [{ hex: at(2, 5) }]))).not.toBeNull();
  });

  it("the battle AI aims it at free hexes beside stacks, sea ones included", () => {
    const s0 = openWater();
    const targets = act(CONCH_ACT).aiTargets?.(s0, "a0") ?? [];
    const hexes = targets.map((t) => (t[0] as { hex: Hex }).hex);
    expect(hexes.length).toBeGreaterThan(0);
    for (const h of hexes) expect(isFreeHexFor(s0, h, HERMIT_CRAB)).toBe(true);
    // The Hammerhead swims at (14, 5): the hexes around it are sea.
    expect(hexes.some((h) => groundAt(s0, h)?.kind === "sea")).toBe(true);
    // A Sprout aimed at a sea hex is refused by the plain free-hex rule.
    const sea = freeSea(s0);
    expect(actionError(s0, castAction(s0, "sprout", [{ hex: sea }]))).toMatch(
      /free hex/,
    );
  });
});
