/**
 * The battle AI at sea (docs/design/NAVAL.md section 12, bead bzc.156) on
 * small hand-built battles: sea guards advance on a ship instead of waiting
 * in the water, the deck guns still to fire are a term of the board, and
 * the hero aims Tidal Wave at the row that hurts the enemy most. Land
 * battles keep their decisions (the other battle AI tests).
 */
import { describe, expect, it } from "vitest";
import "../../../src/core/magic/index.ts";
import {
  DECK_GUN_EFFECT,
  aiValuePerHp,
  chooseAiAction,
  createBattle,
  evaluateFor,
  getStack,
  hexDistance,
} from "../../../src/core/battle/index.ts";
import type {
  BattleAction,
  BattleSetup,
  BattleStackSetup,
  BattleState,
} from "../../../src/core/battle/index.ts";
import { BOOK, battle as magicBattle } from "../magic/helpers.ts";
import { at, unit } from "./faction-helpers.ts";
import { play } from "./helpers.ts";

function openWater(
  attacker: BattleStackSetup[],
  defender: BattleStackSetup[],
  extra: Partial<BattleSetup> = {},
): BattleState {
  return createBattle({
    seed: 11,
    layout: "open-water",
    attacker: { hero: null, stacks: attacker },
    defender: { hero: null, stacks: defender },
    ...extra,
  }).state;
}

/** Plays Defend for every stack until `id` is active. */
function until(s: BattleState, id: string): BattleState {
  let cur = s;
  for (let i = 0; i < 40 && cur.activeStackId !== id; i++)
    cur = play(cur, {
      type: "defend",
      stackId: cur.activeStackId as string,
    }).state;
  return cur;
}

/** Plays the AI (fast mode) for both sides until the battle ends. */
function autoplay(
  s0: BattleState,
  weights: Record<string, number> = {},
): BattleState {
  let s = s0;
  for (let i = 0; i < 400 && s.winner === null; i++)
    s = play(s, chooseAiAction(s, { mode: "fast", weights })).state;
  return s;
}

describe("sea guards advance (NAVAL 3.6 and 12)", () => {
  // Two stacks of knights on the ship's deck against a Hammerhead in the
  // water: the knights cannot come out to it.
  const knightsAndShark = (): BattleState =>
    openWater(
      [unit("knight", 6, at(3, 5)), unit("knight", 6, at(3, 7))],
      [unit("hammerhead", 3, at(14, 5))],
    );

  it("a Swimmer guard comes aboard and fights instead of waiting for the round limit", () => {
    const end = autoplay(knightsAndShark());
    expect(end.winner).not.toBeNull();
    expect(end.round).toBeLessThan(6);
    // Without the rule it keeps out of the knights' reach to the limit.
    const waited = autoplay(knightsAndShark(), { seaGuardsAdvance: 0 });
    expect(waited.round).toBe(15);
    expect(getStack(waited, "d0").count).toBe(3);
  });

  it("does not apply to a guard on land or to a side with a hero", () => {
    // The same stacks on a land field: no sea, no rule (byte for byte).
    const land = createBattle({
      seed: 11,
      obstacles: [],
      attacker: {
        hero: null,
        stacks: [unit("knight", 6, at(3, 5)), unit("knight", 6, at(3, 7))],
      },
      defender: { hero: null, stacks: [unit("hammerhead", 3, at(14, 5))] },
    }).state;
    const s = until(land, "d0");
    expect(chooseAiAction(s, { mode: "fast" })).toEqual(
      chooseAiAction(s, { mode: "fast", weights: { seaGuardsAdvance: 0 } }),
    );
  });
});

describe("deck guns in the evaluation (NAVAL 3.3 and 12)", () => {
  it("counts the next shot on the strongest enemy stack, for and against", () => {
    const setup: BattleSetup = {
      seed: 11,
      layout: "deck",
      attacker: {
        hero: null,
        stacks: [unit("knight", 6, at(2, 5))],
        deckGun: 35,
      },
      defender: {
        hero: null,
        // The Siren (20 HP) is the weaker stack: the gun hits the crew.
        stacks: [unit("siren", 1, at(12, 3)), unit("corsair", 9, at(12, 7))],
      },
    };
    const s = createBattle(setup).state;
    expect(s.scheduled.some((e) => e.effect.id === DECK_GUN_EFFECT)).toBe(true);
    const silent: BattleState = {
      ...s,
      scheduled: s.scheduled.filter((e) => e.effect.id !== DECK_GUN_EFFECT),
    };
    const target = getStack(s, "d1");
    const shot = 35 * aiValuePerHp(target.creature);
    expect(evaluateFor(s, "attacker") - evaluateFor(silent, "attacker")).toBe(
      shot,
    );
    expect(evaluateFor(s, "defender") - evaluateFor(silent, "defender")).toBe(
      -shot,
    );
  });

  it("stops counting when its side holds no living stack", () => {
    const s = createBattle({
      seed: 11,
      layout: "deck",
      attacker: {
        hero: null,
        stacks: [unit("knight", 6, at(2, 5))],
        deckGun: 35,
      },
      defender: { hero: null, stacks: [unit("corsair", 9, at(12, 7))] },
    }).state;
    const gone: BattleState = {
      ...s,
      stacks: s.stacks.map((x) =>
        x.side === "attacker" ? { ...x, count: 0 } : x,
      ),
    };
    const silent: BattleState = {
      ...gone,
      scheduled: gone.scheduled.filter((e) => e.effect.id !== DECK_GUN_EFFECT),
    };
    expect(evaluateFor(gone, "defender")).toBe(evaluateFor(silent, "defender"));
  });
});

describe("Tidal Wave (NAVAL 12)", () => {
  const storm3 = { schoolRanks: { ...BOOK.schoolRanks, storm: 3 } };
  const heroAct = (a: BattleAction) => {
    expect(a.type).toBe("heroAct");
    return a as Extract<BattleAction, { type: "heroAct" }>;
  };

  it("sweeps the row with the most enemies", () => {
    const s = magicBattle({
      mine: [{ hex: at(0, 1) }],
      theirs: [
        { hex: at(9, 5), count: 20 },
        { hex: at(11, 5), count: 20 },
        { hex: at(13, 5), count: 20 },
        { hex: at(12, 9), count: 20 },
      ],
      magic: { ...storm3, pages: ["tidal-wave"], mana: 40 },
    });
    const a = heroAct(chooseAiAction(s));
    expect(a.act).toBe("tidal-wave");
    const t = a.targets[0];
    expect(t !== undefined && "hex" in t ? t.hex.row : -1).toBe(5);
  });

  it("spares a row where its own stack stands", () => {
    const s = magicBattle({
      mine: [{ hex: at(0, 1) }, { hex: at(7, 5), count: 20 }],
      theirs: [
        { hex: at(9, 5), count: 20 },
        { hex: at(11, 5), count: 20 },
        { hex: at(9, 8), count: 20 },
        { hex: at(11, 8), count: 20 },
      ],
      magic: { ...storm3, pages: ["tidal-wave"], mana: 40 },
    });
    const a = heroAct(chooseAiAction(s));
    expect(a.act).toBe("tidal-wave");
    const t = a.targets[0];
    expect(t !== undefined && "hex" in t ? t.hex.row : -1).toBe(8);
  });
});

describe("Swimmers and walkers on a deck layout (NAVAL 3.8)", () => {
  it("a walker never plans a step into the sea; a Swimmer crosses it", () => {
    const s = openWater(
      [unit("knight", 6, at(3, 5))],
      [unit("hammerhead", 3, at(14, 5))],
    );
    const knight = until(s, "a0");
    const a = chooseAiAction(knight, { mode: "fast" });
    if (a.type === "move") expect(a.to.col).toBeLessThanOrEqual(4);
    const shark = until(s, "d0");
    const b = chooseAiAction(shark, { mode: "fast" });
    expect(b.type).toBe("move");
    if (b.type === "move")
      expect(hexDistance(b.to, at(3, 5))).toBeLessThan(
        hexDistance(at(14, 5), at(3, 5)),
      );
  });
});
